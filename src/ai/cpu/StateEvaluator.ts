// src/ai/cpu/StateEvaluator.ts
import { GameState, PlayerID } from '../types';
import { Profile } from '../profiles';

export interface FeatureVector {
  lifeLead: number;
  myBoardPower: number;
  myUnitCount: number;
  theirUnitCount: number;
  domainLead: number;
  siteDamageThisTurn: number; // convenience: set by ActionScorer when relevant
  killValue: number;          // idem
  removalValue: number;       // idem (non-fight spell-based removal)
  useAllManaBias: number;     // “spend your mana” heuristic
  thresholdProgress: number;  // better match between thresholds and hand needs
  protectAvatar: number;      // safety margin
}

export class StateEvaluator {
  constructor(private profile: Profile) {}

  public features(state: GameState, me: PlayerID): FeatureVector {
    const meView = state.players[me];
    const opp = Object.keys(state.players).find(p => p !== me)!;
    const oppView = state.players[opp];

    const myBoardPower = (meView.units ?? []).reduce((s, u) => s + (u.power ?? 0), 0);
    const theirBoardPower = (oppView.units ?? []).reduce((s, u) => s + (u.power ?? 0), 0);
    const manaRemaining = Math.max(0, meView.manaAvailable ?? 0);
    const normalizedMana = Math.min(6, manaRemaining) / 6;

    const fv: FeatureVector = {
      lifeLead: (meView.avatar.life - oppView.avatar.life) / 20, // normalize
      myBoardPower,
      myUnitCount: meView.units.length,
      theirUnitCount: oppView.units.length,
      domainLead: meView.sites.length - oppView.sites.length,
      siteDamageThisTurn: 0,
      killValue: 0,
      removalValue: 0,
      useAllManaBias: -normalizedMana,
      thresholdProgress: this.thresholdNeedMatch(me),
      protectAvatar: Math.max(0, 10 - dangerToAvatar(state, me)) / 10,
    };

    function dangerToAvatar(s: GameState, pid: PlayerID): number {
      const us = s.players[pid];
      const them = s.players[Object.keys(s.players).find(p => p !== pid)!];
      // very rough: nearby enemy power in 1 step on surface
      const myLoc = us.avatar.location;
      const threat = them.units.filter(u => u.location.region === myLoc.region)
        .filter(u => Math.abs(u.location.x - myLoc.x) + Math.abs(u.location.y - myLoc.y) <= 1)
        .reduce((sum, u) => sum + (u.power ?? 0), 0);
      return threat;
    }

    return fv;
  }

  public score(state: GameState, me: PlayerID, overrides?: Partial<FeatureVector>): number {
    const f = { ...this.features(state, me), ...(overrides ?? {}) };
    const w = this.profile.weights;
    let s = 0;
    for (const [k, v] of Object.entries(f)) s += (w[k] ?? 0) * v;
    return s;
  }

  // crude estimate of how well our thresholds cover what’s in hand
  private thresholdNeedMatch(me: PlayerID): number {
    // This is a hook; implement using CardDB if desired at initialization time.
    // For now, return 0 and let ActionScorer provide instantaneous “this spell is now playable” bonuses.
    return 0;
  }
}
