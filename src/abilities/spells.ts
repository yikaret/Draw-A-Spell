/**
 * Data-driven spell registry and runtime entrypoints.
 * - Registry keyed by `code` (e.g., 'LIGHTNING_BOLT').
 * - `getSpellAbility(code)` for runtime targeting gates in App.
 * - `runSpell(g, pid, card, params)` to execute.
 * - `provideSpellHostHelpers(...)` lets App inject its existing helpers
 *    (castLightningBolt, castEarthquake, castBrowse) without importing App here.
 */

import type { AbilityCtx } from './avatars';

export type SpellTargeting = 'none' | 'click-tile' | 'click-unit';

export type SpellParams =
  | { kind: 'immediate' }
  | { kind: 'click'; x: number; y: number };

export type SpellAbility = {
  code: string; // e.g., 'LIGHTNING_BOLT'
  targeting: SpellTargeting;
  canCast?(ctx: AbilityCtx, card: unknown): boolean;
  resolve(ctx: AbilityCtx, params: SpellParams): void | boolean;
};

// ---------------- Registry ----------------

const REGISTRY = new Map<string, SpellAbility>();

export function registerSpell(ability: SpellAbility): void {
  REGISTRY.set(ability.code, ability);
}

export function registerSpells(abilities: readonly SpellAbility[]): void {
  for (const a of abilities) REGISTRY.set(a.code, a);
}

export function getSpellAbility(code: string): SpellAbility | undefined {
  return REGISTRY.get(code);
}

// -------------- Host helper injection --------------

// …existing imports & types…

export type SpellHostHelpers = {
  castLightningBolt: (g: any, pid: any, x: number, y: number) => void;
  castEarthquake:   (g: any, pid: any, x: number, y: number) => void;
  castBrowse:       (g: any, pid: any, n?: number, keep?: number) => void;
  castCraterize?:   (g: any, pid: any, x: number, y: number) => void;
  chooseRandomIndex?: (opts: {
    count: number;
    context?: string;
    labels?: string[];
    controllerPid?: AbilityCtx['pid'];
  }) => number;
  selectOne?: (opts: {
    title: string;
    message?: string;
    options: Array<{ label: string; value: number }>;
    allowCancel?: boolean;
    cancelLabel?: string;
  }) => Promise<number | null>;
  requestGameSync?: () => void;

  // Optional engine helpers (already present in your file)
  unitArrayAtRegion?: (g: any, x: number, y: number, region: any) => any[];
  cellOf?:             (g: any, x: number, y: number) => any;
  inside?:             (g: any, x: number, y: number) => boolean;
  damageUnit?:         (g: any, u: any, amount: number, opts?: { sourceElement?: string }) => void;

  // NEW: expose Fireball projectile launcher to the registry
  fireballProjectile: (
    g: any,
    pid: any,
    from: { x: number; y: number; region: any },
    dir: 'N' | 'S' | 'E' | 'W'
  ) => void;
  shootCustomProjectile?: (
    g: any,
    payload: {
      from: { x: number; y: number; region: any };
      dir: 'N' | 'S' | 'E' | 'W';
      amount: number;
      label?: string;
      opts?: {
        sourceUnit?: any;
        sourceElement?: string;
        projectileStyle?: 'hook' | 'arrow' | 'fire' | 'lightning';
      };
    }
  ) => Promise<void> | void;
  emitProjectileFx?: (
    g: any,
    payload: {
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      style: 'hook' | 'arrow' | 'fire' | 'lightning';
      returnToSource?: boolean;
      hit?: boolean;
      pid?: number;
      cardName?: string;
      source?: 'combat' | 'spell' | 'effect' | 'unknown';
    }
  ) => void;

  // Optional: let spells refresh artifact passives after forced drops
  refreshUnitArtifactPassives?: (g: any, unit: any) => void;
};

// …rest of spells.ts unchanged (getSpellAbility, registerSpells, provideSpellHostHelpers, etc.)

let HOST_HELPERS: SpellHostHelpers | null = null;
let CURRENT_RANDOM_CTX: AbilityCtx | null = null;

/** App.tsx calls this once (after defining the helpers) to avoid circular imports. */
export function provideSpellHostHelpers(h: SpellHostHelpers): void {
  HOST_HELPERS = h;
}

/** Used by implementations to access the injected helpers. */
export function getSpellHostHelpers(): SpellHostHelpers | null {
  return HOST_HELPERS;
}

export function getCurrentRandomCtx(): AbilityCtx | null {
  return CURRENT_RANDOM_CTX;
}

// -------------- Runner ----------------

/**
 * Execute a spell. App handles cost + cemetery/log/threshold afterward.
 * We rely on `card.spellCode` (computed in App.tsx).
 */
export function runSpell(
  g: AbilityCtx['state'],
  pid: AbilityCtx['pid'],
  card: { name: string; spellCode?: string },
  params: SpellParams
): boolean {
  let code = card.spellCode;
  if (!code && card.name) {
    code = card.name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (code) (card as any).spellCode = code;
  }
  if (!code) {
    if ((import.meta as any)?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[spells] Missing spellCode on "${card.name}". App should set it via toSpellCode(name).`);
    }
    return false;
  }
  const ability = REGISTRY.get(code);
  if (!ability) {
    if ((import.meta as any)?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[spells] Unregistered spell code "${code}" for card "${card.name}".`);
    }
    return false;
  }

  const ctx: AbilityCtx = { state: g, pid };
  CURRENT_RANDOM_CTX = ctx;
  if (ability.canCast && !ability.canCast(ctx, card)) {
    CURRENT_RANDOM_CTX = null;
    return false;
  }
  const stack: Array<{ name: string; pid: AbilityCtx['pid'] }> =
    ((g as any)._spellDamageStack ?? ((g as any)._spellDamageStack = []));
  stack.push({ name: card.name, pid });
  const prevForced = (g as any)._forceMoveSourcePid;
  (g as any)._forceMoveSourcePid = pid;
  let success = true;
  try {
    const result = ability.resolve(ctx, params);
    if (result === false) success = false;
  } finally {
    CURRENT_RANDOM_CTX = null;
    stack.pop();
    if (prevForced === undefined) delete (g as any)._forceMoveSourcePid;
    else (g as any)._forceMoveSourcePid = prevForced;
  }
  return success;
}
