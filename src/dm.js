import { discordRequest, DiscordApiError } from './discord-api.js';

const VALORANT_RED = 0xff4655;
const NIGHT_MARKET_PURPLE = 0x8b5cf6;

const formatVp = (price) => `${price.toLocaleString('en-US')} VP`;
const unix = (iso) => Math.floor(Date.parse(iso) / 1000);

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'numeric', day: 'numeric' }).format(date);
}

// Builds the DM: one embed for the daily store with the banner, plus one for the night market when it is open.
export function buildStoreMessage({ skins, nightMarket = [], riotId, refreshesAt, bannerFileName, timeZone, now = new Date() }) {
  const total = skins.reduce((sum, skin) => sum + skin.price, 0);
  const lines = skins.map((skin) => `**${skin.name}**　${formatVp(skin.price)}`);

  const embeds = [
    {
      title: `${formatDate(now, timeZone)} のデイリーストア`,
      description: [
        ...lines,
        '',
        `合計 **${formatVp(total)}**`,
        `次の更新 <t:${unix(refreshesAt)}:R>`,
      ].join('\n'),
      color: VALORANT_RED,
      image: bannerFileName ? { url: `attachment://${bannerFileName}` } : undefined,
      footer: riotId ? { text: riotId } : undefined,
      timestamp: now.toISOString(),
    },
  ];

  if (nightMarket.length > 0) {
    embeds.push({
      title: 'ナイトマーケット開催中',
      description: nightMarket
        .map((skin) => `**${skin.name}**　~~${formatVp(skin.basePrice)}~~ → ${formatVp(skin.price)} (-${skin.discountPercent}%)`)
        .join('\n'),
      color: NIGHT_MARKET_PURPLE,
    });
  }

  return { embeds };
}

async function openDm(botToken, userId) {
  try {
    const channel = await discordRequest(botToken, 'POST', '/v10/users/@me/channels', { recipient_id: userId });
    return channel.id;
  } catch (error) {
    throw explain(error);
  }
}

function explain(error) {
  if (error instanceof DiscordApiError && error.code === 50007) {
    return new Error(
      'Bot cannot DM you. Make sure the bot is in a server you are in and that DMs from server members are allowed.',
    );
  }
  return error;
}

export async function sendStoreDm({ botToken, userId }, message, banner) {
  const channelId = await openDm(botToken, userId);
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({ ...message, attachments: banner ? [{ id: 0, filename: banner.fileName }] : [] }),
  );
  if (banner) form.append('files[0]', new Blob([banner.content], { type: 'image/png' }), banner.fileName);
  try {
    await discordRequest(botToken, 'POST', `/v10/channels/${channelId}/messages`, form);
  } catch (error) {
    throw explain(error);
  }
}

// Best effort: tells the user why today's store could not be sent (e.g. expired cookies).
export async function sendErrorDm({ botToken, userId }, error, hint) {
  if (!botToken || !userId) return;
  try {
    const channelId = await openDm(botToken, userId);
    await discordRequest(botToken, 'POST', `/v10/channels/${channelId}/messages`, {
      embeds: [
        {
          title: 'ストアを取得できませんでした',
          description: [hint, `\`\`\`\n${error.message}\n\`\`\``].filter(Boolean).join('\n'),
          color: 0x9ca3af,
        },
      ],
    });
  } catch (dmError) {
    console.warn(`Could not send the error DM: ${dmError.message}`);
  }
}
