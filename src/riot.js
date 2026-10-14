import { applySetCookies, stringifyCookies } from './cookies.js';

// Unofficial endpoints used by the VALORANT client.
// Reference: https://valapidocs.techchrism.me/
const AUTHORIZE_URL =
  'https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in' +
  '&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20openid&nonce=1';
const USER_INFO_URL = 'https://auth.riotgames.com/userinfo';
const ENTITLEMENTS_URL = 'https://entitlements.auth.riotgames.com/api/token/v1';
const GEO_URL = 'https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant';
const VERSION_URL = 'https://valorant-api.com/v1/version';

export const VP_CURRENCY_ID = '85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741';

const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify(
    {
      platformType: 'PC',
      platformOS: 'Windows',
      platformOSVersion: '10.0.19042.1.256.64bit',
      platformChipset: 'Unknown',
    },
    null,
    '\t',
  ).replace(/\n/g, '\r\n'),
).toString('base64');

const REGION_TO_SHARD = { na: 'na', latam: 'na', br: 'na', eu: 'eu', ap: 'ap', kr: 'kr' };

export class RiotAuthError extends Error {}

export function extractTokens(location) {
  const accessToken = location.match(/access_token=([\w.-]+)/)?.[1];
  const idToken = location.match(/id_token=([\w.-]+)/)?.[1];
  return { accessToken, idToken };
}

export function regionToShard(region) {
  const shard = REGION_TO_SHARD[region];
  if (!shard) throw new Error(`Unknown VALORANT region: ${region}`);
  return shard;
}

async function readJson(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed with status ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

export async function getClientVersion() {
  const json = await readJson(await fetch(VERSION_URL), 'Version lookup');
  return json.data;
}

// Uses the saved Riot session cookies to get fresh access/id tokens.
// Returns the tokens and the cookie map updated with any rotated cookies.
export async function reauthWithCookies(cookies, userAgent) {
  const response = await fetch(AUTHORIZE_URL, {
    redirect: 'manual',
    headers: { cookie: stringifyCookies(cookies), 'user-agent': userAgent },
  });
  const location = response.headers.get('location') ?? '';

  if (response.status === 403 || response.status === 429) {
    throw new RiotAuthError(
      `Riot auth returned ${response.status}. The IP may be rate limited or blocked by Cloudflare.`,
    );
  }
  if (!location || location.includes('/login')) {
    throw new RiotAuthError(
      'Riot session cookies are invalid or expired. Copy a fresh ssid cookie into RIOT_COOKIES.',
    );
  }

  const { accessToken, idToken } = extractTokens(location);
  if (!accessToken || !idToken) {
    throw new RiotAuthError(`Riot auth did not return tokens (status ${response.status}).`);
  }

  return {
    accessToken,
    idToken,
    cookies: applySetCookies(cookies, response.headers.getSetCookie()),
  };
}

export async function getSession({ cookies, region: regionOverride }) {
  const version = await getClientVersion();
  const userAgent = `RiotClient/${version.riotClientBuild} rso-auth (Windows;10;;Professional, x64)`;
  const auth = await reauthWithCookies(cookies, userAgent);
  const bearer = { Authorization: `Bearer ${auth.accessToken}` };

  const userInfo = await readJson(await fetch(USER_INFO_URL, { headers: bearer }), 'User info');
  const entitlements = await readJson(
    await fetch(ENTITLEMENTS_URL, {
      method: 'POST',
      headers: { ...bearer, 'Content-Type': 'application/json' },
    }),
    'Entitlements',
  );

  let region = regionOverride;
  if (!region) {
    const geo = await readJson(
      await fetch(GEO_URL, {
        method: 'PUT',
        headers: { ...bearer, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: auth.idToken }),
      }),
      'Region lookup',
    );
    region = geo.affinities.live;
  }

  const gameName = userInfo.acct?.game_name;
  const tagLine = userInfo.acct?.tag_line;

  return {
    puuid: userInfo.sub,
    riotId: gameName ? `${gameName}#${tagLine}` : '',
    region,
    shard: regionToShard(region),
    accessToken: auth.accessToken,
    entitlementsToken: entitlements.entitlements_token,
    clientVersion: version.riotClientVersion,
    cookies: auth.cookies,
  };
}

export async function getStorefront(session) {
  const response = await fetch(
    `https://pd.${session.shard}.a.pvp.net/store/v3/storefront/${session.puuid}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Riot-Entitlements-JWT': session.entitlementsToken,
        'X-Riot-ClientPlatform': CLIENT_PLATFORM,
        'X-Riot-ClientVersion': session.clientVersion,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  return readJson(response, 'Storefront');
}

// Pulls the daily skin offers (and the night market, if open) out of a storefront response.
export function parseStorefront(storefront, now = Date.now()) {
  const panel = storefront.SkinsPanelLayout ?? {};
  const offers = panel.SingleItemStoreOffers ?? [];
  const priceByLevel = new Map(
    offers.map((offer) => [offer.Rewards?.[0]?.ItemID ?? offer.OfferID, offer.Cost?.[VP_CURRENCY_ID] ?? 0]),
  );

  const daily = (panel.SingleItemOffers ?? []).map((levelId) => ({
    levelId,
    price: priceByLevel.get(levelId) ?? 0,
  }));

  const nightMarket = (storefront.BonusStore?.BonusStoreOffers ?? []).map((bonus) => ({
    levelId: bonus.Offer?.Rewards?.[0]?.ItemID,
    price: bonus.DiscountCosts?.[VP_CURRENCY_ID] ?? 0,
    basePrice: bonus.Offer?.Cost?.[VP_CURRENCY_ID] ?? 0,
    discountPercent: bonus.DiscountPercent ?? 0,
  }));

  const remaining = panel.SingleItemOffersRemainingDurationInSeconds ?? 0;
  return {
    daily,
    nightMarket,
    refreshesAt: new Date(now + remaining * 1000).toISOString(),
  };
}
