import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Accepts a Cookie header ("ssid=a; clid=b") or a bare ssid value.
export function parseCookieHeader(header) {
  const cookies = {};
  if (!header) return cookies;
  const trimmed = header.trim();
  if (!trimmed.includes('=')) {
    cookies.ssid = trimmed;
    return cookies;
  }
  for (const part of trimmed.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

// Applies Set-Cookie headers on top of an existing cookie map.
export function applySetCookies(cookies, setCookieHeaders = []) {
  const next = { ...cookies };
  for (const header of setCookieHeaders) {
    const [pair, ...attributes] = header.split(';');
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = attributes.some((attr) => {
      const [key, val] = attr.split('=').map((s) => s.trim().toLowerCase());
      if (key === 'max-age') return Number(val) <= 0;
      if (key === 'expires') return Date.parse(val) <= Date.now();
      return false;
    });
    if (expired || value === '') delete next[name];
    else next[name] = value;
  }
  return next;
}

export function stringifyCookies(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

const deriveKey = (passphrase) => scryptSync(passphrase, 'valorant-store-widget', 32);

export function encryptJson(value, passphrase) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
}

export function decryptJson(text, passphrase) {
  const payload = JSON.parse(text);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const data = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
  return JSON.parse(data.toString('utf8'));
}

// Returns the saved cookies, or null when there is no usable jar.
export function readCookieJar(path, passphrase) {
  if (!path || !existsSync(path)) return null;
  try {
    return decryptJson(readFileSync(path, 'utf8'), passphrase).cookies ?? null;
  } catch (error) {
    console.warn(`Could not read cookie jar (${error.message}); falling back to RIOT_COOKIES.`);
    return null;
  }
}

export function writeCookieJar(path, passphrase, cookies) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encryptJson({ cookies, savedAt: new Date().toISOString() }, passphrase));
}
