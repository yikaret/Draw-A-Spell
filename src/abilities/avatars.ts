// src/abilities/avatars.ts
// Registry + types for Avatar abilities. Keep this file tiny; the logic lives in impl.generated.ts.

export type AbilityCtx = {
  state: any;                 // your real Game object
  pid: any;                   // PlayerId
  // Optional adapters to your engine (hook these to your own functions):
  drawSpell?: (pid: any, n?: number) => void;
  randomUnitAtLocation?: (siteId: any, exceptUnitId?: any) => any | null;
  spendMana?: (pid: any, n: number) => boolean;
  castCopyOfSpellFromGY?: (pid: any, originalCard: any) => void;
  castFireballFromSiteCard?: (pid: any, siteCard: any) => void;
  applyCostModifier?: (pred: (card: any) => boolean, delta: number, scope: 'turn'|'one') => void;
};

export type AvatarAbility = {
  name: string;
  // lifecycle / passives:
  onSetup?: (ctx: AbilityCtx) => void;
  onTurnStart?: (ctx: AbilityCtx) => void;
  onAttackKill?: (ctx: AbilityCtx, killer: any, victim: any) => void;
  onCardCast?: (ctx: AbilityCtx, card: any) => void;
  onCosting?: (ctx: AbilityCtx, card: any, baseCost?: number) => number;
  powerBonus?: (ctx: AbilityCtx) => number;

  // taps / once-per-turn:
  tapPrimary?: (ctx: AbilityCtx) => void;   // “Tap → Play or draw a site.” (most Avatars)
  tapSecondary?: (ctx: AbilityCtx) => void; // Avatar-specific second tap (if any)
  oncePerTurn?: (ctx: AbilityCtx) => void;  // Air move, Dragonlord ability copy, etc.
};

const abilities: Record<string, AvatarAbility> = {};

// The implementation object is generated and kept separate:
import { allAvatarAbilities } from './impl.generated';

for (const [k, v] of Object.entries(allAvatarAbilities)) abilities[k] = v;

export function getAvatarAbility(name: string): AvatarAbility | undefined {
  return abilities[name];
}

export function registerAllAvatars(): void {
  // Intentionally a no-op; importing impl.generated registers everything in-memory.
  // Keep for potential future side effects.
}
