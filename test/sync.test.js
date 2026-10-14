import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySetCookies,
  decryptJson,
  encryptJson,
  parseCookieHeader,
  stringifyCookies,
} from '../src/cookies.js';
import { extractTokens, parseStorefront, regionToShard, VP_CURRENCY_ID } from '../src/riot.js';
import { buildSkinIndex, describeOffers } from '../src/skins.js';
import { buildWidgetFields } from '../src/discord.js';
import { renderBanner } from '../src/banner.js';

test('parseCookieHeader accepts a cookie header or a bare ssid', () => {
  assert.deepEqual(parseCookieHeader('ssid=abc.def; clid=ue1; tdid=x=y'), {
    ssid: 'abc.def',
    clid: 'ue1',
    tdid: 'x=y',
  });
  assert.deepEqual(parseCookieHeader('  eyJhbGciOi  '), { ssid: 'eyJhbGciOi' });
  assert.deepEqual(parseCookieHeader(''), {});
});

test('applySetCookies rotates and expires cookies', () => {
  const next = applySetCookies({ ssid: 'old', asid: 'gone', clid: 'keep' }, [
    'ssid=new; Path=/; HttpOnly; Secure',
    'asid=; Max-Age=0',
    'sub=123; Expires=Wed, 21 Oct 2099 07:28:00 GMT',
  ]);
  assert.deepEqual(next, { ssid: 'new', clid: 'keep', sub: '123' });
  assert.equal(stringifyCookies(next), 'ssid=new; clid=keep; sub=123');
});

test('cookie jar encryption round-trips and rejects the wrong key', () => {
  const encrypted = encryptJson({ cookies: { ssid: 'secret' } }, 'passphrase');
  assert.ok(!encrypted.includes('secret'));
  assert.deepEqual(decryptJson(encrypted, 'passphrase'), { cookies: { ssid: 'secret' } });
  assert.throws(() => decryptJson(encrypted, 'wrong'));
});

test('extractTokens reads tokens from the redirect fragment', () => {
  const location =
    'https://playvalorant.com/opt_in#access_token=aaa.bbb-c_d&scope=openid&id_token=eee.fff&token_type=Bearer';
  assert.deepEqual(extractTokens(location), { accessToken: 'aaa.bbb-c_d', idToken: 'eee.fff' });
});

test('regionToShard maps shared shards', () => {
  assert.equal(regionToShard('ap'), 'ap');
  assert.equal(regionToShard('latam'), 'na');
  assert.throws(() => regionToShard('moon'));
});

const storefront = {
  SkinsPanelLayout: {
    SingleItemOffers: ['lvl-1', 'lvl-2'],
    SingleItemStoreOffers: [
      { OfferID: 'lvl-1', Cost: { [VP_CURRENCY_ID]: 1775 }, Rewards: [{ ItemID: 'lvl-1' }] },
      { OfferID: 'lvl-2', Cost: { [VP_CURRENCY_ID]: 875 }, Rewards: [{ ItemID: 'lvl-2' }] },
    ],
    SingleItemOffersRemainingDurationInSeconds: 3600,
  },
  BonusStore: {
    BonusStoreOffers: [
      {
        Offer: { Cost: { [VP_CURRENCY_ID]: 2175 }, Rewards: [{ ItemID: 'lvl-3' }] },
        DiscountPercent: 30,
        DiscountCosts: { [VP_CURRENCY_ID]: 1522 },
      },
    ],
  },
};

test('parseStorefront extracts daily offers, prices and refresh time', () => {
  const store = parseStorefront(storefront, Date.parse('2026-10-14T00:00:00Z'));
  assert.deepEqual(store.daily, [
    { levelId: 'lvl-1', price: 1775 },
    { levelId: 'lvl-2', price: 875 },
  ]);
  assert.equal(store.refreshesAt, '2026-10-14T01:00:00.000Z');
  assert.deepEqual(store.nightMarket, [
    { levelId: 'lvl-3', price: 1522, basePrice: 2175, discountPercent: 30 },
  ]);
});

test('buildSkinIndex maps skin levels to names, images and tier colors', () => {
  const index = buildSkinIndex(
    [
      {
        displayName: 'プライム ヴァンダル',
        contentTierUuid: 'tier-premium',
        displayIcon: null,
        chromas: [{ fullRender: 'https://example.com/chroma.png' }],
        levels: [{ uuid: 'lvl-1', displayIcon: 'https://example.com/lvl1.png' }, { uuid: 'lvl-1b', displayIcon: null }],
      },
    ],
    [{ uuid: 'tier-premium', devName: 'Premium', highlightColor: 'd1548dff' }],
  );
  assert.deepEqual(index.get('lvl-1'), {
    name: 'プライム ヴァンダル',
    image: 'https://example.com/lvl1.png',
    tierName: 'Premium',
    tierColor: '#d1548d',
    tierIcon: null,
  });
  assert.equal(index.get('lvl-1b').image, 'https://example.com/chroma.png');

  const [known, unknown] = describeOffers(
    [{ levelId: 'lvl-1', price: 1775 }, { levelId: 'missing', price: 875 }],
    index,
  );
  assert.equal(known.name, 'プライム ヴァンダル');
  assert.equal(unknown.name, 'Unknown skin');
});

test('buildWidgetFields produces the fields used by the widget config', () => {
  const skins = [
    { name: 'A', price: 1775, image: 'https://example.com/a.png' },
    { name: 'B', price: 875, image: null },
  ];
  const fields = buildWidgetFields({
    skins,
    riotId: 'Player#JP1',
    refreshesAt: '2026-10-15T00:00:00Z',
    bannerUrl: 'https://example.com/banner.png',
    timeZone: 'Asia/Tokyo',
    now: new Date('2026-10-14T00:05:00Z'),
  });
  const byName = Object.fromEntries(fields.map((field) => [field.name, field]));

  assert.equal(byName.store_title.value, '10/14 のデイリーストア');
  assert.equal(byName.refresh_at.value, '10/15 09:00');
  assert.equal(byName.total_price.value, 2650);
  assert.deepEqual(byName.store_banner, { type: 3, name: 'store_banner', value: { url: 'https://example.com/banner.png' } });
  assert.equal(byName.skin1_price_text.value, '1,775 VP');
  assert.equal(byName.skin2_name.value, 'B');
  assert.equal(byName.skin2_image, undefined, 'image fields without a URL are skipped');
});

test('buildWidgetFields falls back to the first skin image without a banner', () => {
  const fields = buildWidgetFields({
    skins: [{ name: 'A', price: 1775, image: 'https://example.com/a.png' }],
    riotId: '',
    refreshesAt: '2026-10-15T00:00:00Z',
    bannerUrl: null,
    timeZone: 'UTC',
  });
  assert.equal(fields.find((field) => field.name === 'store_banner').value.url, 'https://example.com/a.png');
});

test('renderBanner returns a PNG even when images are missing', async () => {
  const png = await renderBanner([
    { name: 'とても長いスキンの名前がここに入ります テスト テスト', price: 2175, image: null, tierColor: '#f5955b' },
    { name: 'B', price: 875, image: '/does/not/exist.png', tierColor: null },
  ]);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});
