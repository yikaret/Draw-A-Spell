import { Card, Elem } from '../App';

export type DeckEntry = { cardId: string; qty: number };
export type CardIndex = Record<string, Card>;

export type CostBucket = { label: string; cost: number; count: number; breakdown: Record<string, number> };
export type ThresholdSummary = {
  demand: Record<Elem, number>;
  maxRequired: Record<Elem, number>;
  siteSources: Record<Elem, number>;
};

export type DeckComposition = {
  total: number;
  sites: number;
  spells: number;
  units: number;
  artifacts: number;
  auras: number;
  others: number;
  uniqueNames: number;
};

export type DeckStats = {
  costCurve: CostBucket[];
  thresholds: ThresholdSummary;
  composition: DeckComposition;
};

const ELEMENTS: Elem[] = ['Air', 'Earth', 'Fire', 'Water'];

export function computeDeckStats(decklist: DeckEntry[], cardIndex: CardIndex): DeckStats {
  const curveMap = new Map<number, CostBucket>();
  const ensureBucket = (cost: number): CostBucket => {
    const bucket = curveMap.get(cost) ?? {
      label: cost >= 8 ? '8+' : cost.toString(),
      cost,
      count: 0,
      breakdown: Object.create(null) as Record<string, number>,
    };
    curveMap.set(cost, bucket);
    return bucket;
  };

  const thresholds: ThresholdSummary = {
    demand: { Air: 0, Earth: 0, Fire: 0, Water: 0 },
    maxRequired: { Air: 0, Earth: 0, Fire: 0, Water: 0 },
    siteSources: { Air: 0, Earth: 0, Fire: 0, Water: 0 },
  };

  let sites = 0, spells = 0, units = 0, artifacts = 0, auras = 0, others = 0;
  const nameSet = new Set<string>();

  for (const entry of decklist) {
    const card = cardIndex[entry.cardId];
    if (!card || entry.qty <= 0) continue;
    const qty = entry.qty;
    nameSet.add(card.name);

    // Composition
    switch (card.kind) {
      case 'Site': sites += qty; break;
      case 'Spell': spells += qty; break;
      case 'Unit': units += qty; break;
      case 'ArtifactCard': artifacts += qty; break;
      case 'AuraCard': auras += qty; break;
      default: others += qty; break;
    }

    // Cost curve
    const rawCost = typeof (card as any).cost === 'number' ? (card as any).cost : 0;
    const bucketCost = rawCost >= 8 ? 8 : Math.max(0, rawCost);
    const bucket = ensureBucket(bucketCost);
    bucket.count += qty;
    const bKey =
      card.kind === 'Unit' ? 'Unit' :
      card.kind === 'Spell' ? 'Spell' :
      card.kind === 'ArtifactCard' ? 'Artifact' :
      card.kind === 'AuraCard' ? 'Aura' :
      card.kind === 'Site' ? 'Site' : 'Other';
    bucket.breakdown[bKey] = (bucket.breakdown[bKey] ?? 0) + qty;

    // Threshold demand
    const threshold = (card as any).threshold as Partial<Record<Elem, number>> | undefined;
    if (threshold) {
      for (const e of ELEMENTS) {
        const need = Math.max(0, threshold[e] ?? 0);
        if (need > 0) {
          thresholds.demand[e] += need * qty;
          thresholds.maxRequired[e] = Math.max(thresholds.maxRequired[e], need);
        }
      }
    }

    // Site sources
    if (card.kind === 'Site') {
      const elems = ((card as any).elements as Elem[] | undefined) ?? [];
      for (const e of elems) {
        thresholds.siteSources[e] += qty;
      }
    }
  }

  const composition: DeckComposition = {
    total: decklist.reduce((sum, e) => sum + e.qty, 0),
    sites,
    spells,
    units,
    artifacts,
    auras,
    others,
    uniqueNames: nameSet.size,
  };

  const curve = Array.from(curveMap.values())
    .sort((a, b) => a.cost - b.cost);

  return { costCurve: curve, thresholds, composition };
}

