// src/ai/rulesAdapter.ts
import { Action, GameState, PlayerID } from './types';

export interface RulesAdapter {
  // return all legal actions for player at the current moment (phase/reaction windows included)
  getLegalActions(state: GameState, playerId: PlayerID): Action[];

  // pure (ideally): return the next state if we take action; engine enforces rules/storyline ordering
  simulate(state: GameState, action: Action): GameState;

  // optional: terminal indicator for EndTurn
  isTerminalAction(action: Action): boolean;

  // convenience
  isMyTurn(state: GameState, playerId: PlayerID): boolean;
}

export interface RandomSource {
  next(): number; // 0..1
}
