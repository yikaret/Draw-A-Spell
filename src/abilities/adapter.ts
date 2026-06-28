// src/abilities/adapter.ts
import type { AbilityCtx } from './avatars';

export function makeAbilityCtx(state: any, pid: any): AbilityCtx {
  return {
    state, pid,
    drawSpell: state.drawSpell?.bind(state),
    spendMana: state.spendMana?.bind(state),
    castCopyOfSpellFromGY: state.castCopyOfSpellFromGY?.bind(state),
    castFireballFromSiteCard: state.castFireballFromSiteCard?.bind(state),
    applyCostModifier: state.applyCostModifier?.bind(state),
  };
}
