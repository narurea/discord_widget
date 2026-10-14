import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertConfig, loadConfig } from './config.js';
import { parseCookieHeader, readCookieJar, writeCookieJar } from './cookies.js';
import { getSession, getStorefront, parseStorefront, RiotAuthError } from './riot.js';
import { describeOffers, loadSkinIndex } from './skins.js';
import { renderBanner } from './banner.js';
import { publishToBranch } from './github-assets.js';
import { buildWidgetFields, updateWidget } from './discord.js';

async function login(riot) {
  const fromSecret = parseCookieHeader(riot.cookies);
  const fromJar = readCookieJar(riot.cookieJarPath, riot.cookieJarKey);

  if (fromJar) {
    try {
      return await getSession({ cookies: fromJar, region: riot.region });
    } catch (error) {
      if (!(error instanceof RiotAuthError) || !riot.cookies) throw error;
      console.warn(`Saved cookies were rejected (${error.message}); retrying with RIOT_COOKIES.`);
    }
  }
  return getSession({ cookies: fromSecret, region: riot.region });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = loadConfig();
  assertConfig(config, { dryRun });

  const session = await login(config.riot);
  writeCookieJar(config.riot.cookieJarPath, config.riot.cookieJarKey, session.cookies);
  console.log(`Logged in as ${session.riotId || session.puuid} (${session.region}).`);

  const [storefront, skinIndex] = await Promise.all([
    getStorefront(session),
    loadSkinIndex(config.language),
  ]);
  const store = parseStorefront(storefront);
  const skins = describeOffers(store.daily, skinIndex);
  if (skins.length === 0) throw new Error('The storefront did not contain any daily skins.');

  for (const skin of skins) console.log(`  ${skin.name} - ${skin.price} VP`);

  const now = new Date();
  const fileName = `store-${now.toISOString().slice(0, 10)}.png`;
  const banner = await renderBanner(skins, { fontPath: config.banner.fontPath });
  mkdirSync(config.banner.outputDir, { recursive: true });
  writeFileSync(join(config.banner.outputDir, fileName), banner);
  writeFileSync(
    join(config.banner.outputDir, 'store.json'),
    JSON.stringify({ riotId: session.riotId, refreshesAt: store.refreshesAt, skins }, null, 2),
  );

  let bannerUrl = null;
  if (!dryRun && config.banner.publish && config.banner.githubRepository && config.banner.githubToken) {
    bannerUrl = await publishToBranch({
      repository: config.banner.githubRepository,
      token: config.banner.githubToken,
      branch: config.banner.branch,
      fileName,
      content: banner,
    });
    console.log(`Banner published: ${bannerUrl}`);
  }

  const fields = buildWidgetFields({
    skins,
    riotId: session.riotId,
    refreshesAt: store.refreshesAt,
    bannerUrl,
    timeZone: config.timeZone,
    now,
  });

  if (dryRun) {
    console.log(`Dry run: banner saved to ${join(config.banner.outputDir, fileName)}`);
    console.log(JSON.stringify(fields, null, 2));
    return;
  }

  await updateWidget(config.discord, session.riotId || 'VALORANT', fields);
  console.log('Discord widget updated.');
}

main().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exit(1);
});
