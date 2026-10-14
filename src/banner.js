import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

const WIDTH = 1280;
const HEIGHT = 720;
const FONT = 'BannerFont';

// Japanese-capable fonts commonly found on Linux runners and desktops.
const FONT_CANDIDATES = [
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  'C:\\Windows\\Fonts\\YuGothB.ttc',
  'C:\\Windows\\Fonts\\meiryob.ttc',
  '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
];

let fontReady = false;
function ensureFont(fontPath) {
  if (fontReady) return;
  for (const path of [fontPath, ...FONT_CANDIDATES].filter(Boolean)) {
    if (existsSync(path) && GlobalFonts.registerFromPath(path, FONT)) {
      fontReady = true;
      return;
    }
  }
  console.warn('No Japanese font found; banner text may not render. Set BANNER_FONT_PATH.');
  fontReady = true;
}

async function loadSource(source) {
  if (!source) return null;
  try {
    if (/^https?:\/\//.test(source)) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`status ${response.status}`);
      return await loadImage(Buffer.from(await response.arrayBuffer()));
    }
    return await loadImage(await readFile(source));
  } catch (error) {
    console.warn(`Could not load image ${source}: ${error.message}`);
    return null;
  }
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function drawCard(ctx, skin, image, x, y, width, height) {
  const accent = skin.tierColor ?? '#ff4655';

  ctx.fillStyle = '#1b2733';
  ctx.fillRect(x, y, width, height);

  // Rarity glow from the bottom-left corner.
  const glow = ctx.createRadialGradient(x, y + height, 0, x, y + height, width);
  glow.addColorStop(0, `${accent}66`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 8, height);

  const textAreaHeight = 78;
  if (image) {
    const maxWidth = width - 80;
    const maxHeight = height - textAreaHeight - 40;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + 20 + (maxHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  }

  ctx.fillStyle = 'rgba(15, 25, 35, 0.8)';
  ctx.fillRect(x + 8, y + height - textAreaHeight, width - 8, textAreaHeight);

  const price = `${skin.price.toLocaleString('en-US')} VP`;
  ctx.font = `bold 30px ${FONT}`;
  const priceWidth = ctx.measureText(price).width;
  ctx.fillStyle = '#ff4655';
  ctx.fillText(price, x + width - priceWidth - 24, y + height - 28);

  ctx.fillStyle = '#ece8e1';
  ctx.fillText(fitText(ctx, skin.name, width - priceWidth - 80), x + 28, y + height - 28);
}

// Renders the four daily skins as a 2x2 grid and returns PNG bytes.
export async function renderBanner(skins, { fontPath } = {}) {
  ensureFont(fontPath);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f1923';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const margin = 24;
  const gap = 16;
  const cardWidth = (WIDTH - margin * 2 - gap) / 2;
  const cardHeight = (HEIGHT - margin * 2 - gap) / 2;
  const cards = skins.slice(0, 4);
  const images = await Promise.all(cards.map((skin) => loadSource(skin.image)));

  cards.forEach((skin, i) => {
    const x = margin + (i % 2) * (cardWidth + gap);
    const y = margin + Math.floor(i / 2) * (cardHeight + gap);
    drawCard(ctx, skin, images[i], x, y, cardWidth, cardHeight);
  });

  return canvas.encode('png');
}
