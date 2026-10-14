const API = 'https://discord.com/api';

export class DiscordApiError extends Error {
  constructor(status, body) {
    super(`Discord API returned ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.code = body?.code;
  }
}

// Sends a bot-authenticated request. `body` may be a plain object (sent as JSON) or FormData.
// Rate limited requests are retried after the delay Discord asks for.
export async function discordRequest(botToken, method, path, body) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const headers = {
      Authorization: `Bot ${botToken}`,
      'User-Agent': 'DiscordBot (https://github.com/narurea/discord_widget, 1.0.0)',
    };
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${API}${path}`, { method, headers, body: payload });
    if (response.status === 204) return null;

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (response.ok) return json;

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || json?.retry_after || 5;
      console.warn(`Discord rate limited the request; retrying in ${retryAfter}s.`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    throw new DiscordApiError(response.status, json);
  }
  throw new Error('Discord API kept rate limiting the request.');
}
