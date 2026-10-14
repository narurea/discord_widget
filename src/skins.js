// Skin names, images and rarity tiers from the community API at https://valorant-api.com
const API_BASE = 'https://valorant-api.com/v1';

async function getData(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`valorant-api.com ${path} returned ${response.status}`);
  return (await response.json()).data;
}

// "f5955bff" (RGBA) -> "#f5955b"
export function toHexColor(rgba) {
  return rgba ? `#${rgba.slice(0, 6)}` : null;
}

export function buildSkinIndex(skins, tiers) {
  const tierById = new Map(tiers.map((tier) => [tier.uuid, tier]));
  const index = new Map();
  for (const skin of skins) {
    const tier = tierById.get(skin.contentTierUuid);
    const chroma = skin.chromas?.[0];
    for (const level of skin.levels ?? []) {
      index.set(level.uuid, {
        name: skin.displayName,
        image: level.displayIcon ?? chroma?.fullRender ?? chroma?.displayIcon ?? skin.displayIcon ?? null,
        tierName: tier?.devName ?? null,
        tierColor: toHexColor(tier?.highlightColor),
        tierIcon: tier?.displayIcon ?? null,
      });
    }
  }
  return index;
}

export async function loadSkinIndex(language) {
  const [skins, tiers] = await Promise.all([
    getData(`/weapons/skins?language=${encodeURIComponent(language)}`),
    getData(`/contenttiers?language=${encodeURIComponent(language)}`),
  ]);
  return buildSkinIndex(skins, tiers);
}

export function describeOffers(offers, index) {
  return offers.map((offer) => ({
    ...offer,
    ...(index.get(offer.levelId) ?? { name: 'Unknown skin', image: null, tierName: null, tierColor: null }),
  }));
}
