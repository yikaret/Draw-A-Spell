// src/ai/carddb/CardTags.ts
import { CardInfo } from '../types';

// Adds simple tags we can use in heuristics (e.g., “removal”, “sweeper”, “ranged”, “airborne”)
export function addDerivedTags(c: CardInfo): CardInfo {
  const tags = new Set<string>(c.tags ?? []);
  for (const k of (c.keywords ?? [])) {
    const k0 = k.toLowerCase();
    if (k0.includes('ranged')) tags.add('ranged');
    if (k0.includes('airborne')) tags.add('airborne');
    if (k0.includes('voidwalk')) tags.add('voidwalk');
    if (k0.includes('submerge')) tags.add('submerge');
    if (k0.includes('burrowing')) tags.add('burrowing');
    if (k0.includes('lethal')) tags.add('lethal');
  }
  // very naive text lookup (improve by parsing oracle text later)
  if (c.type === 'magic') {
    // If your pool provides effect text, detect “deal X damage to unit” -> removal
    // tags.add('removal');
  }
  return { ...c, tags: Array.from(tags) };
}
