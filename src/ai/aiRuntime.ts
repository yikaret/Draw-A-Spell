// src/aiRuntime.ts
import { BasicCPU, AggroProfile, RulesAdapter, GameState, PlayerID, Action, Profile } from './index';

export type CPUHandle = {
  id: PlayerID;
  takeOneAction: (state: GameState) => { state: GameState; action: Action | null };
  chooseReaction: (state: GameState) => Action | null;
};

export function createCPU(
  rules: RulesAdapter,
  myId: PlayerID = 'cpu-1',
  profile: Profile = AggroProfile,
): CPUHandle {
  const cpu = new BasicCPU(myId, rules, profile);

  return {
    id: myId,
    takeOneAction(state: GameState) {
      // Advance exactly one decision/action (React-friendly; no while-loops here)
      if (state.activePlayer !== myId) return { state, action: null };
      const action = cpu.chooseNextAction(state);
      const next = rules.simulate(state, action);
      return { state: next, action };
    },
    chooseReaction(state: GameState) {
      return cpu.chooseReaction(state);
    },
  };
}
