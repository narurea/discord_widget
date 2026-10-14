import { existsSync } from 'node:fs';

// Load .env for local runs. In GitHub Actions the values come from secrets instead.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;

export function loadConfig() {
  return {
    riot: {
      // Cookie header copied from auth.riotgames.com, e.g. "ssid=...; clid=...; tdid=..."
      // A bare ssid value is also accepted.
      cookies: env('RIOT_COOKIES'),
      // Optional: encrypted cookie jar that keeps the refreshed cookies between runs.
      cookieJarPath: env('COOKIE_JAR_PATH'),
      cookieJarKey: env('COOKIE_JAR_KEY'),
      // Optional override (ap / kr / na / eu / latam / br). Detected automatically when empty.
      region: env('VALORANT_REGION'),
    },
    discord: {
      // Where to send the store: "dm" (default), "widget", or both ("dm,widget").
      outputs: env('DISCORD_OUTPUTS', 'dm').split(',').map((value) => value.trim()).filter(Boolean),
      applicationId: env('DISCORD_APPLICATION_ID'),
      userId: env('DISCORD_USER_ID'),
      identityId: env('DISCORD_IDENTITY_ID', env('DISCORD_USER_ID')),
      botToken: env('DISCORD_BOT_TOKEN'),
    },
    banner: {
      // Widget output only: the banner must be hosted somewhere Discord can load it.
      // Set BANNER_PUBLISH=false for private repositories (Discord cannot load private raw files).
      publish: env('BANNER_PUBLISH', 'true') !== 'false',
      // Where the generated banner image is published. Defaults to GITHUB_REPOSITORY in Actions.
      githubRepository: env('BANNER_GITHUB_REPOSITORY', env('GITHUB_REPOSITORY')),
      githubToken: env('BANNER_GITHUB_TOKEN', env('GITHUB_TOKEN')),
      branch: env('BANNER_BRANCH', 'widget-assets'),
      outputDir: env('BANNER_OUTPUT_DIR', 'out'),
      fontPath: env('BANNER_FONT_PATH'),
    },
    language: env('VALORANT_LANGUAGE', 'ja-JP'),
    timeZone: env('TIME_ZONE', 'Asia/Tokyo'),
  };
}

export function assertConfig(config, { dryRun = false } = {}) {
  const missing = [];
  if (!config.riot.cookies && !config.riot.cookieJarPath) missing.push('RIOT_COOKIES');
  if (!dryRun) {
    if (!config.discord.userId) missing.push('DISCORD_USER_ID');
    if (!config.discord.botToken) missing.push('DISCORD_BOT_TOKEN');
    if (config.discord.outputs.includes('widget') && !config.discord.applicationId) {
      missing.push('DISCORD_APPLICATION_ID');
    }
  }
  if (config.riot.cookieJarPath && !config.riot.cookieJarKey) missing.push('COOKIE_JAR_KEY');
  const unknown = config.discord.outputs.filter((output) => !['dm', 'widget'].includes(output));
  if (unknown.length > 0) throw new Error(`Unknown DISCORD_OUTPUTS value: ${unknown.join(', ')}`);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
