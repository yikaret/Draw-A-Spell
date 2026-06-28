import { Card, Elem } from '../App';
import { CardIndex, DeckEntry } from './computeDeckStats';

export type SimulationOptions = {
  games?: number;
  turns?: number;
  seed?: number;
  mulliganRule?: (hand: Card[]) => boolean;
};

export type SimulationResult = {
  games: number;
  turns: number;
  averagePlayableByTurn: number[];
  thresholdMetByTurn: Record<Elem, number[]>;
  mulliganRate: number;
  sampleHand: Card[];
};

const ELEMENTS: Elem[] = ['Air', 'Earth', 'Fire', 'Water'];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function defaultMulliganRule(hand: Card[]): boolean {
  const sites = hand.filter(c => c.kind === 'Site').length;
  return sites === 0;
}

export function simulateDraws(
  decklist: DeckEntry[],
  cardIndex: CardIndex,
  opts: SimulationOptions = {}
): SimulationResult {
  const games = Math.max(1, opts.games ?? 1000);
  const turns = Math.max(1, opts.turns ?? 5);
  const seed = opts.seed ?? 1_337_337;
  const mulliganRule = opts.mulliganRule ?? defaultMulliganRule;

  const deckIds: string[] = [];
  for (const entry of decklist) {
    const card = cardIndex[entry.cardId];
    if (!card) continue;
    for (let i = 0; i < entry.qty; i++) deckIds.push(entry.cardId);
  }
  const rng = mulberry32(seed);

  const totalPlayable: number[] = Array.from({ length: turns }, () => 0);
  const thresholdHits: Record<Elem, number[]> = {
    Air: Array.from({ length: turns }, () => 0),
    Earth: Array.from({ length: turns }, () => 0),
    Fire: Array.from({ length: turns }, () => 0),
    Water: Array.from({ length: turns }, () => 0),
  };
  let mulligans = 0;

  // Precompute max requirement per element for threshold tracking
  const maxReq: Record<Elem, number> = { Air: 0, Earth: 0, Fire: 0, Water: 0 };
  for (const entry of decklist) {
    const card = cardIndex[entry.cardId];
    if (!card) continue;
    const th = (card as any).threshold as Partial<Record<Elem, number>> | undefined;
    if (!th) continue;
    for (const e of ELEMENTS) {
      maxReq[e] = Math.max(maxReq[e], th[e] ?? 0);
    }
  }

  // Capture one reproducible sample hand
  const sampleHand: Card[] = [];

  for (let g = 0; g < games; g++) {
    const working = [...deckIds];
    shuffle(working, rng);

    let hand = working.splice(0, 7).map(id => cardIndex[id]).filter(Boolean) as Card[];
    if (mulliganRule(hand)) {
      mulligans++;
      working.push(...hand.map(c => c.id)); // simple put back then reshuffle
      shuffle(working, rng);
      hand = working.splice(0, 6).map(id => cardIndex[id]).filter(Boolean) as Card[];
    }
    if (g === 0) sampleHand.push(...hand);

    const drawPile = working;
    let sitesDrawn: Card[] = hand.filter(c => c.kind === 'Site');
    let manaSources = sitesDrawn.length;
    const thresholdSources: Record<Elem, number> = { Air: 0, Earth: 0, Fire: 0, Water: 0 };
    for (const site of sitesDrawn) {
      const elems = ((site as any).elements as Elem[] | undefined) ?? [];
      for (const e of elems) thresholdSources[e] += 1;
    }

    for (let turn = 1; turn <= turns; turn++) {
      // draw step
      const draw = drawPile.shift();
      if (draw) {
        const c = cardIndex[draw];
        if (c) {
          hand.push(c);
          if (c.kind === 'Site') {
            manaSources += 1;
            const elems = ((c as any).elements as Elem[] | undefined) ?? [];
            for (const e of elems) thresholdSources[e] += 1;
          }
        }
      }

      // playable cards given mana + threshold
      const playable = hand.filter(c => {
        const cost = Math.max(0, (c as any).cost ?? 0);
        if (cost > manaSources) return false;
        const th = (c as any).threshold as Partial<Record<Elem, number>> | undefined;
        if (!th) return true;
        for (const e of ELEMENTS) {
          if ((th[e] ?? 0) > thresholdSources[e]) return false;
        }
        return true;
      }).length;
      totalPlayable[turn - 1] += playable;

      for (const e of ELEMENTS) {
        if (maxReq[e] <= 0) continue;
        if (thresholdSources[e] >= maxReq[e]) thresholdHits[e][turn - 1] += 1;
      }
    }
  }

  const averagePlayableByTurn = totalPlayable.map(sum => sum / games);
  const thresholdMetByTurn: Record<Elem, number[]> = { Air: [], Earth: [], Fire: [], Water: [] };
  for (const e of ELEMENTS) {
    thresholdMetByTurn[e] = thresholdHits[e].map(val => games > 0 ? val / games : 0);
  }

  return {
    games,
    turns,
    averagePlayableByTurn,
    thresholdMetByTurn,
    mulliganRate: mulligans / games,
    sampleHand,
  };
}

