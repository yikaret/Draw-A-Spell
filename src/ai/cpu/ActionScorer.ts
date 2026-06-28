// src/ai/cpu/ActionScorer.ts
import { Action, GameState, PlayerID } from '../types';
import { RulesAdapter } from '../rulesAdapter';
import { StateEvaluator, FeatureVector } from './StateEvaluator';
import { Profile } from '../profiles';

type Point = { x: number; y: number };

export interface ScorerOptions {
  lookaheadPly?: number; // 0=greedy, 1=simulate single action
}

export class ActionScorer {
  constructor(
    private evaluator: StateEvaluator,
    private rules: RulesAdapter,
    private me: PlayerID,
    private profile: Profile,
    private opts: ScorerOptions = { lookaheadPly: 1 }
  ) {}

  public scoreAction(state: GameState, action: Action): number {
    const { bonus, overrides } = this.estimateImmediate(state, action);

    const baseScore = this.evaluator.score(state, this.me);
    const lookahead = this.opts.lookaheadPly ?? 1;
    const needsNextState = lookahead > 0 || !!overrides;
    let nextState: GameState | null = null;

    if (needsNextState) {
      nextState = this.rules.simulate(state, action);
      const outcome = nextState.gameOver;
      if (outcome) {
        if (outcome.winner === this.me) return 1000 + bonus;
        if (outcome.winner && outcome.winner !== this.me) return -1000 + bonus;
        return bonus; // stalemate/draw
      }
    }

    if (lookahead > 0 && nextState) {
      const nextScore = this.evaluator.score(nextState, this.me, overrides);
      return (nextScore - baseScore) + bonus;
    }

    if (overrides) {
      const overrideScore = this.evaluator.score(state, this.me, overrides);
      return (overrideScore - baseScore) + bonus;
    }

    return bonus;
  }

  private estimateImmediate(state: GameState, action: Action): { bonus: number; overrides?: Partial<FeatureVector> } {
    let bonus = 0;
    const overrides: Partial<FeatureVector> = {};
    const meView = state.players[this.me];
    const directives = this.profile.directives;
    const oppId = Object.keys(state.players).find(p => p !== this.me)!;
    const oppAvatar = state.players[oppId].avatar.location;
    const cardInfoLookup = state.cardIndex ?? {};
    const distToOppAvatar = (pt?: Point | null) => {
      if (!pt) return Infinity;
      return Math.abs((pt.x ?? 0) - oppAvatar.x) + Math.abs((pt.y ?? 0) - oppAvatar.y);
    };

    switch (action.type) {
      case 'Draw': {
        if (state.phase !== 'start') bonus -= 0.4;
        if (directives?.mustPlayOpeningSite && state.turn <= 2 && (meView.sites?.length ?? 0) === 0) {
          if ((meView.hand.atlas?.length ?? 0) > 0) bonus -= 0.6;
        }
        break;
      }
      case 'CastSpell':
        bonus += 0.25; // bias to spend mana on aggression
        const info = cardInfoLookup[action.cardId];
        if (info?.type === 'minion') {
          const boardIsThin = (meView.units?.length ?? 0) === 0;
          bonus += boardIsThin ? 0.9 : 0.5; // play bodies if we have none
        }
        if (action.targets && action.targets.some(t => t.kind === 'avatar')) {
          bonus += 0.75; // direct face damage is prized in aggro
          overrides.killValue = 1;
        }
        if (action.targets && action.targets.some(t => t.kind === 'unit')) {
          overrides.removalValue = 1;
        }
        if (action.targets && action.targets.some(t => t.kind === 'site')) {
          overrides.siteDamageThisTurn = 1;
          bonus += 0.4; // hitting sites proxies avatar damage per codex
        }
        if (action.targets && action.targets.some(t => t.kind === 'location')) {
          const locTarget = action.targets.find(t => t.kind === 'location') as { location: Point } | undefined;
          const dist = distToOppAvatar(locTarget?.location);
          if (Number.isFinite(dist)) {
            bonus += Math.max(0, 2 - dist) * 0.2; // closer placement/strike lanes toward avatar
          }
        }
        break;
      case 'MoveAndAttack':
        bonus += 0.05;
        if (action.attack?.kind === 'site') {
          overrides.siteDamageThisTurn = 1;
        } else if (action.attack?.kind === 'unit' || action.attack?.kind === 'avatar') {
          overrides.killValue = 1;
        }
        break;
      case 'AvatarPlayOrDrawSite':
        if (action.choice === 'play') {
          bonus += 0.4; // expanding domain is valuable (more mana/thresholds)
          const placement = action.location;
          if (placement) {
            const dist = distToOppAvatar(placement);
            // Reward forward placement that closes distance to enemy avatar/sites
            if (Number.isFinite(dist)) {
              bonus += Math.max(0, 4 - dist) * 0.25;
            }
          }
        } else {
          bonus -= 0.5; // drawing via avatar delays board presence
        }
        break;
      default:
        break;
    }

    return { bonus, overrides: Object.keys(overrides).length ? overrides : undefined };
  }
}
