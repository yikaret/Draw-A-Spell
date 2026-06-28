// src/ai/cpu/BasicCPU.ts
import { Action, GameState, PlayerID } from '../types';
import { RulesAdapter } from '../rulesAdapter';
import { StateEvaluator } from './StateEvaluator';
import { ActionScorer } from './ActionScorer';
import { Profile } from '../profiles';

export class BasicCPU {
  private evaluator: StateEvaluator;
  private scorer: ActionScorer;

  constructor(
    private me: PlayerID,
    private rules: RulesAdapter,
    private profile: Profile
  ) {
    this.evaluator = new StateEvaluator(profile);
    this.scorer = new ActionScorer(this.evaluator, rules, me, profile, { lookaheadPly: 1 });
  }

  /** Called at decision points during OUR turn (start/main/end phases). */
  public chooseNextAction(state: GameState): Action {
    const legal = this.rules.getLegalActions(state, this.me);
    const winning = this.pickImmediateWin(legal, state);
    if (winning) return winning;

    const forced = this.pickForcedAction(legal, state);
    if (forced) return forced;

    // 1) Start-of-turn draw choice: prefer atlas early or when missing thresholds/sites (rulebook allows atlas or spellbook draw)
    const drawChoice = this.pickDrawIfPresent(legal, state);
    if (drawChoice) return drawChoice;

    const sitePlay = this.bestWithScore(legal, state, a => a.type === 'AvatarPlayOrDrawSite' && a.choice === 'play');
    const cast = this.bestWithScore(legal, state, a => a.type === 'CastSpell');
    const attack = this.bestWithScore(legal, state, a => a.type === 'MoveAndAttack');
    const ability = this.bestWithScore(legal, state, a => a.type === 'ActivateAbility');

    // Aggro prefers pressure: cast creatures/removal, attack, then expand sites.
    const ranked = [cast, attack, sitePlay, ability]
      .filter((entry): entry is { action: Action; score: number } => !!entry)
      .sort((a, b) => b.score - a.score);

    if (ranked.length > 0) {
      const chosen = ranked[0].action;
      if (chosen.type === 'Draw' && ranked.slice(1).some(entry => entry.action.type === 'AvatarPlayOrDrawSite')) {
        const playCandidate = ranked.find(entry => entry.action.type === 'AvatarPlayOrDrawSite');
        if (playCandidate) return playCandidate.action;
      }
      return chosen;
    }

    const fallback = this.bestWithScore(legal, state, a => a.type !== 'EndTurn');
    if (fallback) return fallback.action;

    // If nothing better, end the turn.
    const end = legal.find(a => a.type === 'EndTurn');
    if (end) return end;

    // Fallback (shouldn’t happen): pick the highest score overall
    return this.pickBestByScore(legal, state) ?? legal[0];
  }

  /** Called when it’s the opponent’s action and we’re offered a reaction (Defend/Intercept triggers). */
  public chooseReaction(state: GameState): Action | null {
    const legal = this.rules.getLegalActions(state, this.me);
    // Prefer Defend if we can create a favorable trade or save a key unit
    const defend = this.pickBestByScore(legal, state, a => a.type === 'Defend');
    if (defend) return defend;

    const intercept = this.pickBestByScore(legal, state, a => a.type === 'Intercept');
    if (intercept) return intercept;

    return null;
  }

  private pickDrawIfPresent(legal: Action[], state: GameState): Action | null {
    if (state.phase !== 'start') return null;
    const drawAtlas = legal.find(a => a.type === 'Draw' && a.deck === 'atlas');
    const drawSpellbook = legal.find(a => a.type === 'Draw' && a.deck === 'spellbook');
    if (!drawAtlas && !drawSpellbook) return null;

    const meView = state.players[this.me];
    const turns = state.turn;
    const p = this.profile.drawPolicy;

    // Opening turn drawback: the first player skips their step-4 draw entirely.
    if (turns === 1 && state.activePlayer === this.me) return null;

    const thresholds = meView.thresholdsAvailable ?? {};
    const primaryThreshold = Math.max(
      thresholds.air ?? 0,
      thresholds.earth ?? 0,
      thresholds.fire ?? 0,
      thresholds.water ?? 0,
    );
    const sitesInPlay = meView.sites.length;
    const atlasInHand = meView.hand.atlas.length;
    const spellsInHand = meView.hand.spellbook.length;

    const needsThreshold =
      (p.preferAtlasIf.missingThreshold ?? false) &&
      spellsInHand > 0 &&
      primaryThreshold <= 0;

    const needsSites =
      (p.preferAtlasIf.fewSitesInPlay ?? false) &&
      sitesInPlay === 0 &&
      atlasInHand === 0;

    if (turns <= p.earlyAtlasBiasTurns && drawAtlas && atlasInHand === 0) return drawAtlas;
    if (needsThreshold && drawAtlas) return drawAtlas;
    if (needsSites && drawAtlas) return drawAtlas;

    return drawSpellbook ?? drawAtlas ?? null;
  }

  private pickBestByScore(legal: Action[], state: GameState, filter?: (a: Action) => boolean): Action | null {
    return this.bestWithScore(legal, state, filter)?.action ?? null;
  }

  private bestWithScore(
    legal: Action[],
    state: GameState,
    filter?: (a: Action) => boolean
  ): { action: Action; score: number } | null {
    const list = filter ? legal.filter(filter) : legal.slice();
    if (list.length === 0) return null;
    let best: Action | null = null;
    let bestScore = -Infinity;
    for (const a of list) {
      const s = this.scorer.scoreAction(state, a);
      if (s > bestScore) {
        best = a;
        bestScore = s;
      }
    }
    return best ? { action: best, score: bestScore } : null;
  }

  private pickForcedAction(legal: Action[], state: GameState): Action | null {
    const directives = this.profile.directives;
    if (!directives) return null;

    if (directives.mustPlayOpeningSite && this.shouldForceOpeningSitePlay(state)) {
      const playSite = legal.find(a => a.type === 'AvatarPlayOrDrawSite' && a.choice === 'play');
      if (playSite) return playSite;
    }

    return null;
  }

  private shouldForceOpeningSitePlay(state: GameState): boolean {
    if (state.activePlayer !== this.me) return false;
    if (state.turn > 2) return false;
    if (state.phase !== 'main') return false;
    const meView = state.players[this.me];
    return (meView.sites?.length ?? 0) === 0;
  }

  private pickImmediateWin(legal: Action[], state: GameState): Action | null {
    for (const action of legal) {
      const next = this.rules.simulate(state, action);
      if (next.gameOver?.winner === this.me) return action;
    }
    return null;
  }
}
