// src/abilities/impl.generated.ts
// Avatar ability registry that delegates to host-provided implementations.

import type { AbilityCtx, AvatarAbility } from './avatars';

type AvatarHostHelpers = {
  getAbility(name: string): AvatarAbility | undefined;
};

let HOST: AvatarHostHelpers | null = null;

export function provideAvatarHostHelpers(helpers: AvatarHostHelpers): void {
  HOST = helpers;
}

function resolve(name: string): AvatarAbility | undefined {
  return HOST?.getAbility(name);
}

function delegate(name: string): AvatarAbility {
  return {
    name,
    onSetup(ctx: AbilityCtx) {
      resolve(name)?.onSetup?.(ctx);
    },
    onTurnStart(ctx: AbilityCtx) {
      resolve(name)?.onTurnStart?.(ctx);
    },
    onAttackKill(ctx: AbilityCtx, killer: unknown, victim: unknown) {
      resolve(name)?.onAttackKill?.(ctx, killer, victim);
    },
    onCardCast(ctx: AbilityCtx, card: unknown) {
      resolve(name)?.onCardCast?.(ctx, card);
    },
    onCosting(ctx: AbilityCtx, card: unknown, baseCost?: number) {
      const ability = resolve(name);
      const fn = ability?.onCosting as
        | ((ctx: AbilityCtx, card: unknown, baseCost?: number) => number)
        | undefined;
      if (!fn) return 0;
      return fn(ctx, card, baseCost);
    },
    powerBonus(ctx: AbilityCtx) {
      return resolve(name)?.powerBonus?.(ctx) ?? 0;
    },
    tapPrimary(ctx: AbilityCtx) {
      resolve(name)?.tapPrimary?.(ctx);
    },
    tapSecondary(ctx: AbilityCtx) {
      resolve(name)?.tapSecondary?.(ctx);
    },
    oncePerTurn(ctx: AbilityCtx) {
      resolve(name)?.oncePerTurn?.(ctx);
    },
  };
}

const AVATAR_NAMES = [
  'Avatar of Air',
  'Avatar of Earth',
  'Avatar of Fire',
  'Avatar of Water',
  'Archimago',
  'Battlemage',
  'Deathspeaker',
  'Dragonlord',
  'Druid',
  'Elementalist',
  'Enchantress',
  'Magician',
  'Flamecaller',
  'Geomancer',
  'Pathfinder',
  'Seer',
  'Sorcerer',
  'Sparkmage',
  'Spellslinger',
  'Templar',
  'Waveshaper',
  'Witch',
] as const;

export const allAvatarAbilities: Record<string, AvatarAbility> = {};

for (const name of AVATAR_NAMES) {
  allAvatarAbilities[name] = delegate(name);
}

export function getAvatarHostHelpers(): AvatarHostHelpers | null {
  return HOST;
}
