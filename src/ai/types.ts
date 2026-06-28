// src/ai/types.ts
export type PlayerID = string;

export type Region = 'surface' | 'underground' | 'underwater' | 'void';

export interface Location {
  x: number;
  y: number;
  region: Region; // rule: actions target same region unless a card says otherwise (rulebook)
}

export type CardType = 'minion' | 'artifact' | 'aura' | 'magic' | 'site' | 'avatar';

export interface Threshold {
  air?: number;
  earth?: number;
  fire?: number;
  water?: number;
}

export interface CardInfo {
  id: string;
  name: string;
  type: CardType;
  cost?: number;               // mana cost
  threshold?: Threshold;       // e.g. {water: 2}
  power?: number;              // for minions; if split power, store avg or store {atk,def}
  keywords?: string[];         // e.g. ["Airborne", "Ranged 1", "Voidwalk"]
  // free-form tags computed from CardTags.ts
  tags?: string[];
}

export interface Unit {
  id: string;
  controller: PlayerID;
  cardId: string;
  location: Location;
  tapped: boolean;
  canTapForAbilities: boolean; // false if summoning sickness this turn
  power?: number;              // use engine's view; if split, engine should expose both
  keywords?: string[];
  summonedThisTurn?: boolean;
}

export interface Site {
  id: string;
  controller?: PlayerID;       // undefined for rubble
  location: Location;          // surface exists; subsurface implied by region
  thresholds: Threshold;       // affinity granted by site (static)
}

export interface Avatar {
  id: string;
  controller: PlayerID;
  life: number;
  baseAttack?: number;
  location: Location;          // middle of back row at setup; never enters void (rulebook)
  tapped: boolean;
}

export interface Hand {
  spellbook: string[];  // cardIds in hand
  atlas: string[];      // site cardIds in hand
}

export interface PlayerView {
  id: PlayerID;
  avatar: Avatar;
  units: Unit[];
  sites: Site[];
  hand: Hand;
  handInfo?: Record<string, CardInfo>;
  manaAvailable: number;                  // provided by rules at start of turn (rulebook)
  thresholdsAvailable: Threshold;         // derived from controlled sites + effects (rulebook)
}

export interface GameState {
  activePlayer: PlayerID;
  players: Record<PlayerID, PlayerView>;
  turn: number;
  phase: 'start' | 'main' | 'end' | 'opponent-reaction';
  grid: { width: number; height: number };
  cardIndex?: Record<string, CardInfo>;
}

export type Target =
  | { kind: 'unit'; unitId: string }
  | { kind: 'site'; siteId: string }
  | { kind: 'location'; location: Location }
  | { kind: 'avatar'; playerId: PlayerID };

export type Action =
  | { type: 'Draw'; deck: 'atlas' | 'spellbook' }
  | { type: 'AvatarPlayOrDrawSite'; choice: 'play' | 'draw'; siteCardId?: string; location?: Location }
  | { type: 'CastSpell'; casterId: string; cardId: string; targets?: Target[] }
  | { type: 'MoveAndAttack'; unitId: string; path: Location[]; attack?: Target }
  | { type: 'ActivateAbility'; sourceId: string; abilityId: string; targets?: Target[] }
  | { type: 'Defend'; defenderId: string; to: Location; keepOriginalTarget?: boolean }
  | { type: 'Intercept'; interceptorId: string }
  | { type: 'EndTurn' };
// --- Additions ---
export interface GameOver {
  winner?: PlayerID;          // undefined if draw
  reason: string;             // e.g., "Decked", "Avatar reduced to 0"
}

export interface TurnFlags {
  drewThisTurn?: boolean;     // prevents multiple draws in the same start phase
}

export interface PlayerView {
  // ... your existing fields ...
  // Add an actual library (deck) so draws come from here, not created out of thin air.
  library?: {
    atlas: string[];
    spellbook: string[];
  };
  handInfo?: Record<string, CardInfo>;
}

// Extend GameState with:
export interface GameState {
  // ... your existing fields ...
  gameOver?: GameOver | null;
  log?: string[];             // simple textual log, append-as-you-go
  turnFlags?: Record<PlayerID, TurnFlags>;
  cardIndex?: Record<string, CardInfo>;
}
