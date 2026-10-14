// Field types accepted by the Application Identity Profile API.
const TEXT = 1;
const NUMBER = 2;
const IMAGE = 3;

function formatDate(iso, timeZone, options) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone, ...options }).format(new Date(iso));
}

// Builds the dynamic fields the widget config refers to (see widget/widget-config.json).
export function buildWidgetFields({ skins, riotId, refreshesAt, bannerUrl, timeZone, now = new Date() }) {
  const date = formatDate(now.toISOString(), timeZone, { month: 'numeric', day: 'numeric' });
  const refresh = formatDate(refreshesAt, timeZone, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const total = skins.reduce((sum, skin) => sum + skin.price, 0);

  const fields = [
    { type: TEXT, name: 'store_title', value: `${date} のデイリーストア` },
    { type: TEXT, name: 'riot_id', value: riotId || 'VALORANT' },
    { type: TEXT, name: 'refresh_at', value: refresh },
    { type: TEXT, name: 'store_summary', value: skins.map((skin) => skin.name).join(' / ') },
    { type: NUMBER, name: 'total_price', value: total },
  ];

  const banner = bannerUrl ?? skins[0]?.image;
  if (banner) fields.push({ type: IMAGE, name: 'store_banner', value: { url: banner } });

  skins.slice(0, 4).forEach((skin, i) => {
    const n = i + 1;
    fields.push(
      { type: TEXT, name: `skin${n}_name`, value: skin.name },
      { type: NUMBER, name: `skin${n}_price`, value: skin.price },
      { type: TEXT, name: `skin${n}_price_text`, value: `${skin.price.toLocaleString('en-US')} VP` },
    );
    if (skin.image) fields.push({ type: IMAGE, name: `skin${n}_image`, value: { url: skin.image } });
  });

  return fields;
}

export async function updateWidget({ applicationId, userId, identityId, botToken }, username, fields) {
  const url = `https://discord.com/api/v9/applications/${applicationId}/users/${userId}/identities/${identityId}/profile`;
  const body = JSON.stringify({ username, data: { dynamic: fields } });

  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'valorant-store-discord-widget',
      },
      body,
    });

    if (response.ok) return;

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 5;
      console.warn(`Discord rate limited the request; retrying in ${retryAfter}s.`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    throw new Error(`Discord API returned ${response.status}: ${await response.text()}`);
  }
  throw new Error('Discord API kept rate limiting the request.');
}
