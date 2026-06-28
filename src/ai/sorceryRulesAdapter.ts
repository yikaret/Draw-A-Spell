import type { RulesAdapter } from './rulesAdapter';
import type {
  Action,
  GameState,
  PlayerID,
  PlayerView,
  Threshold as AiThreshold,
  Unit as AiUnit,
  Avatar as AiAvatar,
  Site as AiSite,
} from './types';
import type {
  Game as EngineGame,
  PlayerId as EnginePlayerId,
  Token as EngineToken,
  Avatar as EngineAvatar,
  Site as EngineSite,
} from 'src/App';

export type SorceryGameState = GameState & {
  engine: EngineGame;
  meta: {
    turnCounter: number;
  };
};

const ENGINE_PLAYERS: EnginePlayerId[] = [1, 2];

const playerIdToAI = (pid: EnginePlayerId): PlayerID => pid.toString();

const phaseMap = new Map<EngineGame['phase'], SorceryGameState['phase']>([
  ['Start', 'start'],
  ['Main', 'main'],
  ['End', 'end'],
]);

const toAiPhase = (phase: EngineGame['phase']): SorceryGameState['phase'] =>
  phaseMap.get(phase) ?? 'main';

const cloneEngine = (engine: EngineGame): EngineGame => structuredClone(engine);

const keywordsFromToken = (token: EngineToken): string[] => {
  const result: string[] = [];
  if (token.airborne) result.push('airborne');
  if (token.burrowing) result.push('burrowing');
  if (token.submerge) result.push('submerge');
  if (token.voidwalk) result.push('voidwalk');
  if (token.movesFreely) result.push('moves-freely');
  if (token.stealth) result.push('stealth');
  if (token.lethal) result.push('lethal');
  if (token.charge) result.push('charge');
  if (typeof token.ranged === 'number' && token.ranged > 0) {
    result.push(`ranged-${token.ranged}`);
  }
  if (token.spellcaster) result.push('spellcaster');
  return result;
};

const elementsToThreshold = (elements: EngineSite['elements']): AiThreshold => {
  const th: AiThreshold = {};
  for (const elem of elements) {
    const key = elem.toLowerCase() as keyof AiThreshold;
    th[key] = (th[key] ?? 0) + 1;
  }
  return th;
};

const collectSites = (engine: EngineGame, pid: EnginePlayerId): AiSite[] => {
  const sites: AiSite[] = [];
  for (let y = 0; y < engine.height; y++) {
    for (let x = 0; x < engine.width; x++) {
      const site = engine.board[y][x].site;
      if (!site || site.rubble || site.controller !== pid) continue;
      sites.push({
        id: site.id,
        controller: playerIdToAI(pid),
        location: { x, y, region: 'surface' },
        thresholds: elementsToThreshold(site.elements ?? []),
      });
    }
  }
  return sites;
};

const computeThresholdFromSites = (sites: AiSite[]): AiThreshold => {
  const th: AiThreshold = {};
  for (const site of sites) {
    for (const key of Object.keys(site.thresholds) as (keyof AiThreshold)[]) {
      const value = site.thresholds[key] ?? 0;
      th[key] = (th[key] ?? 0) + value;
    }
  }
  return th;
};

const convertAvatar = (avatar: EngineAvatar): AiAvatar => ({
  id: avatar.id,
  controller: playerIdToAI(avatar.player),
  life: avatar.life,
  baseAttack: avatar.power,
  tapped: avatar.tapped,
  location: {
    x: avatar.x,
    y: avatar.y,
    region: avatar.region,
  },
});

const convertToken = (token: EngineToken): AiUnit => ({
  id: token.id,
  controller: playerIdToAI(token.player),
  cardId: token.id,
  location: {
    x: token.x,
    y: token.y,
    region: token.region,
  },
  tapped: token.tapped,
  canTapForAbilities: !token.tapped && !token.summonedThisTurn,
  power: token.power ?? token.atk ?? token.def ?? 0,
  keywords: keywordsFromToken(token),
});

const collectUnits = (engine: EngineGame, pid: EnginePlayerId): AiUnit[] => {
  const units: AiUnit[] = [];
  for (let y = 0; y < engine.height; y++) {
    for (let x = 0; x < engine.width; x++) {
      const cell = engine.board[y][x];
      for (const unit of cell.units) {
        if (unit.player !== pid || unit.kind === 'Avatar') continue;
        units.push(convertToken(unit as EngineToken));
      }
    }
  }
  return units;
};

const collectPlayerView = (engine: EngineGame, pid: EnginePlayerId): PlayerView => {
  const sites = collectSites(engine, pid);
  return {
    id: playerIdToAI(pid),
    avatar: convertAvatar(engine.avatars[pid]),
    units: collectUnits(engine, pid),
    sites,
    hand: {
      spellbook: engine.handSpells[pid]?.map((card) => card.id) ?? [],
      atlas: engine.handAtlas[pid]?.map((card) => card.id) ?? [],
    },
    manaAvailable: engine.mana[pid] ?? 0,
    thresholdsAvailable: computeThresholdFromSites(sites),
  };
};

const convertEngineToGameState = (
  engine: EngineGame,
  previous?: SorceryGameState,
): SorceryGameState => {
  const players: Record<PlayerID, PlayerView> = {} as Record<PlayerID, PlayerView>;
  for (const pid of ENGINE_PLAYERS) {
    players[playerIdToAI(pid)] = collectPlayerView(engine, pid);
  }

  const activePlayer = playerIdToAI(engine.turn);
  const metaTurn = previous
    ? previous.meta.turnCounter + (previous.activePlayer !== activePlayer ? 1 : 0)
    : 1;

  return {
    engine,
    meta: { turnCounter: metaTurn },
    activePlayer,
    players,
    turn: metaTurn,
    phase: toAiPhase(engine.phase),
    grid: { width: engine.width, height: engine.height },
  };
};

export class SorceryRulesAdapter implements RulesAdapter {
  constructor(private readonly opts: { initialState?: EngineGame } = {}) {}

  /** Convert an engine snapshot into an AI-facing state. */
  public fromEngine(engine: EngineGame, previous?: SorceryGameState): SorceryGameState {
    return convertEngineToGameState(cloneEngine(engine), previous);
  }

  public getLegalActions(state: SorceryGameState, playerId: PlayerID): Action[] {
    if (state.activePlayer !== playerId) return [];

    // Placeholder: only offer EndTurn until richer move generation is implemented.
    const actions: Action[] = [{ type: 'EndTurn' }];
    return actions;
  }

  public simulate(state: SorceryGameState, action: Action): SorceryGameState {
    const engineClone = cloneEngine(state.engine);
    const next = convertEngineToGameState(engineClone, state);

    // NOTE: Real simulation must apply the action to engineClone. For now we simply
    // return the cloned snapshot so heuristics have a stable structure to inspect.
    void action; // silence unused warning
    return next;
  }

  public isTerminalAction(action: Action): boolean {
    return action.type === 'EndTurn';
  }

  public isMyTurn(state: SorceryGameState, playerId: PlayerID): boolean {
    return state.activePlayer === playerId;
  }
}

export const sorceryRulesAdapter = new SorceryRulesAdapter();
