// src/ai/simpleRulesAdapter.ts
// Minimal adapter + tiny pure "engine" so the CPU can start doing things now.
// Expand/replace with your real engine as you go.

import { RulesAdapter } from './rulesAdapter';
import {
  Action,
  GameState,
  PlayerID,
  Target,
  Unit,
  Site,
  Avatar,
  Location,
  Threshold,
} from './types';

// -----------------------------
// Helpers
// -----------------------------
function clone<T>(x: T): T { return structuredClone ? structuredClone(x) : JSON.parse(JSON.stringify(x)); }

function otherPlayer(state: GameState, me: PlayerID): PlayerID {
  const ids = Object.keys(state.players);
  return ids.find(id => id !== me)!;
}

function locEq(a: Location, b: Location) { return a.x === b.x && a.y === b.y && a.region === b.region; }

function pushLog(next: GameState, line: string) {
  if (!next.log) next.log = [];
  next.log.push(line);
}

function setGameOver(next: GameState, winner: PlayerID | undefined, reason: string) {
  next.gameOver = { winner, reason };
  pushLog(next, `GAME OVER — ${reason}${winner ? ` | Winner: ${winner}` : ''}`);
}

// check lethal after any action
function checkAvatarLethal(next: GameState): void {
  const [a, b] = Object.keys(next.players);
  const pa = next.players[a];
  const pb = next.players[b];
  if (pa.avatar.life <= 0 && pb.avatar.life <= 0) { setGameOver(next, undefined, 'Double lethal'); return; }
  if (pa.avatar.life <= 0) { setGameOver(next, b, 'Avatar reduced to 0'); return; }
  if (pb.avatar.life <= 0) { setGameOver(next, a, 'Avatar reduced to 0'); return; }
}


function manhattan(a: Location, b: Location) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function stepToward(from: Location, to: Location, bounds: {w:number; h:number}): Location[] {
  // Take a single 4-dir step that reduces distance if possible
  const candidates: Location[] = [
    { x: from.x + Math.sign(to.x - from.x), y: from.y, region: from.region },
    { x: from.x, y: from.y + Math.sign(to.y - from.y), region: from.region },
  ];
  return candidates.filter(p => p.x >= 0 && p.y >= 0 && p.x < bounds.w && p.y < bounds.h);
}

function neighbors(state: GameState, loc: Location): Location[] {
  const n: Location[] = [
    { x: loc.x + 1, y: loc.y, region: loc.region },
    { x: loc.x - 1, y: loc.y, region: loc.region },
    { x: loc.x, y: loc.y + 1, region: loc.region },
    { x: loc.x, y: loc.y - 1, region: loc.region },
  ];
  return n.filter(p => p.x >= 0 && p.y >= 0 && p.x < state.grid.width && p.y < state.grid.height);
}

function isTileEmpty(state: GameState, loc: Location): boolean {
  for (const p of Object.values(state.players)) {
    if (p.avatar && locEq(p.avatar.location, loc)) return false;
    if (p.units.some(u => locEq(u.location, loc))) return false;
    if (p.sites.some(s => locEq(s.location, loc) && s.controller)) return false; // occupied site
  }
  return true;
}

function locationHasSite(state: GameState, loc: Location): boolean {
  for (const p of Object.values(state.players)) {
    if (p.sites.some(s => locEq(s.location, loc) && s.controller)) return true;
  }
  return false;
}

function isUnitSlotFree(state: GameState, loc: Location): boolean {
  for (const p of Object.values(state.players)) {
    if (p.avatar && locEq(p.avatar.location, loc)) return false;
    if (p.units.some(u => locEq(u.location, loc))) return false;
  }
  return true;
}

function unitHasKeyword(u: Unit, keyword: string): boolean {
  return Array.isArray(u.keywords) && u.keywords.some(k => k.toLowerCase() === keyword);
}

function canUnitEnter(state: GameState, unit: Unit, loc: Location): boolean {
  const region = loc.region;
  if (region === unit.location.region) {
    if (region === 'surface') {
      return locationHasSite(state, loc);
    }
    if (region === 'underground') return unitHasKeyword(unit, 'burrowing');
    if (region === 'underwater') return unitHasKeyword(unit, 'submerge');
    if (region === 'void') return unitHasKeyword(unit, 'voidwalk');
  }
  return false;
}

function unitsAt(state: GameState, loc: Location): Unit[] {
  const arr: Unit[] = [];
  for (const p of Object.values(state.players)) {
    for (const u of p.units) if (locEq(u.location, loc)) arr.push(u);
  }
  return arr;
}

function enemyUnitsAdj(state: GameState, me: PlayerID, loc: Location): Unit[] {
  const opp = otherPlayer(state, me);
  const oppUnits = state.players[opp].units;
  const adj = neighbors(state, loc);
  return oppUnits.filter(u => adj.some(a => locEq(a, u.location)));
}

function thresholdsMet(available: Threshold | undefined, required: Threshold | undefined): boolean {
  if (!required) return true;
  for (const key of ['air', 'earth', 'fire', 'water'] as (keyof Threshold)[]) {
    const need = required?.[key] ?? 0;
    if (need <= 0) continue;
    const have = available?.[key] ?? 0;
    if (have < need) return false;
  }
  return true;
}

// -----------------------------
// Minimal legality
// -----------------------------
function legalDraws(state: GameState, me: PlayerID): Action[] {
  if (state.phase !== 'start' || state.activePlayer !== me) return [];
  const f = state.turnFlags?.[me];
  if (f?.drewThisTurn) return []; // already drew this start phase

  // Only allow a draw if the corresponding library has cards
  const lib = state.players[me].library ?? { atlas: [], spellbook: [] };
  const acts: Action[] = [];
  if (lib.atlas.length > 0) acts.push({ type: 'Draw', deck: 'atlas' as const });
  if (lib.spellbook.length > 0) acts.push({ type: 'Draw', deck: 'spellbook' as const });
  return acts;
}

function legalSitePlays(state: GameState, me: PlayerID): Action[] {
  if (state.phase !== 'main' || state.activePlayer !== me) return [];
  const meView = state.players[me];
  const avatar = meView.avatar;
  if (!avatar || avatar.tapped) return [];
  const siteCardId = meView.hand.atlas[0]; // super basic: if we have any site, consider the first
  if (!siteCardId) return [];

  const candidates: Location[] = [];
  const hasSiteAtAvatar = meView.sites.some(s => locEq(s.location, avatar.location));
  if (!hasSiteAtAvatar) {
    candidates.push({ ...avatar.location });
  }

  for (const loc of neighbors(state, avatar.location)) {
    if (isTileEmpty(state, loc)) {
      candidates.push(loc);
    }
  }

  return candidates.map(loc => ({
    type: 'AvatarPlayOrDrawSite' as const,
    choice: 'play' as const,
    siteCardId,
    location: loc,
  }));
}

function legalCastMinions(state: GameState, me: PlayerID): Action[] {
  if (state.phase !== 'main' || state.activePlayer !== me) return [];
  const meView = state.players[me];
  if ((meView.sites ?? []).length === 0) return [];

  const handInfo = meView.handInfo ?? {};
  const infoLookup = state.cardIndex ?? {};
  const thresholds = meView.thresholdsAvailable;

  const actions: Action[] = [];
  for (const cardId of meView.hand.spellbook) {
    const info = handInfo[cardId] ?? infoLookup[cardId];
    if (!info || info.type !== 'minion') continue;
    const cost = info.cost ?? 0;
    if ((meView.manaAvailable ?? 0) < cost) continue;
    if (!thresholdsMet(thresholds, info.threshold)) continue;
    const keywords = new Set(info.keywords ?? []);
    const wantsUnderground = keywords.has('burrowing');
    const wantsUnderwater = keywords.has('submerge');
    const wantsVoid = keywords.has('voidwalk');

    const surfaceTargets: Location[] = [];
    for (const site of meView.sites) {
      const loc = site.location;
      if (!loc) continue;
      if (!isUnitSlotFree(state, loc)) continue;
      surfaceTargets.push({ ...loc });
    }

    const chosenTargets: Location[] = [];
    chosenTargets.push(...surfaceTargets);

    if (wantsUnderground) {
      // naive: allow same tile but marked underground
      for (const loc of surfaceTargets) {
        chosenTargets.push({ x: loc.x, y: loc.y, region: 'underground' });
      }
    }
    if (wantsUnderwater) {
      for (const loc of surfaceTargets) {
        chosenTargets.push({ x: loc.x, y: loc.y, region: 'underwater' });
      }
    }
    if (wantsVoid) {
      // simple heuristic: allow any empty tile (void region modeled as same grid)
      for (let y = 0; y < state.grid.height; y++) {
        for (let x = 0; x < state.grid.width; x++) {
          const loc = { x, y, region: 'void' as const };
          if (isUnitSlotFree(state, loc)) chosenTargets.push(loc);
        }
      }
    }

    if (chosenTargets.length === 0) continue;

    for (const target of chosenTargets) {
      actions.push({
        type: 'CastSpell' as const,
        casterId: meView.avatar.id,
        cardId,
        targets: [{ kind: 'location' as const, location: target }],
      });
    }
  }
  return actions;
}

function legalAttacksVsAvatarOrSites(state: GameState, me: PlayerID): Action[] {
  if (state.phase !== 'main' || state.activePlayer !== me) return [];
  const meView = state.players[me];
  const oppId = otherPlayer(state, me);
  const oppView = state.players[oppId];
  const actions: Action[] = [];

  for (const u of meView.units) {
    if (u.tapped || u.summonedThisTurn) continue;

    const canEnter = (loc: Location) => canUnitEnter(state, u, loc);
    const adjs = neighbors(state, u.location);

    // Adjacent enemy avatar
    const avatarLoc = oppView.avatar.location;
    if (adjs.some(l => locEq(l, avatarLoc)) && canEnter(avatarLoc)) {
      actions.push({
        type: 'MoveAndAttack',
        unitId: u.id,
        path: [avatarLoc],
        attack: { kind: 'avatar', playerId: oppId }
      });
      continue;
    }

    // Adjacent enemy units
    const adjEnemies = enemyUnitsAdj(state, me, u.location);
    for (const enemy of adjEnemies) {
      if (!canEnter(enemy.location)) continue;
      actions.push({
        type: 'MoveAndAttack',
        unitId: u.id,
        path: [enemy.location],
        attack: { kind: 'unit', unitId: enemy.id }
      });
    }

    // Adjacent enemy sites
    const adjSite = oppView.sites.find(s => adjs.some(a => locEq(a, s.location)) && canEnter(s.location));
    if (adjSite) {
      actions.push({
        type: 'MoveAndAttack',
        unitId: u.id,
        path: [adjSite.location],
        attack: { kind: 'site', siteId: adjSite.id }
      });
      continue;
    }

    // Otherwise move toward avatar
    const steps = stepToward(u.location, oppView.avatar.location, { w: state.grid.width, h: state.grid.height })
      .filter(loc => isUnitSlotFree(state, loc) && canEnter(loc));
    if (steps.length) {
      actions.push({
        type: 'MoveAndAttack',
        unitId: u.id,
        path: [steps[0]]
      });
    }
  }

  return actions;
}


function legalMovesAndAttacks(state: GameState, me: PlayerID): Action[] {
  if (state.phase !== 'main' || state.activePlayer !== me) return [];
  const meView = state.players[me];
  const oppId = otherPlayer(state, me);
  const oppView = state.players[oppId];
  const actions: Action[] = [];

  for (const u of meView.units) {
    if (u.tapped || u.summonedThisTurn) continue;
    const canEnter = (loc: Location) => canUnitEnter(state, u, loc);
    // Move 1 step into empty neighbor; attack if enemy is adjacent after move or already adjacent
    const adjs = neighbors(state, u.location);

    // Attack without moving if already adjacent to enemy
    const adjacentEnemies = enemyUnitsAdj(state, me, u.location);
    for (const enemy of adjacentEnemies) {
      if (!canEnter(enemy.location)) continue;
      actions.push({
        type: 'MoveAndAttack',
        unitId: u.id,
        path: [enemy.location],
        attack: { kind: 'unit', unitId: enemy.id } as Target
      });
    }

    // Try simple one-step moves into empty tiles
    for (const step of adjs) {
      if (!isUnitSlotFree(state, step)) continue;
      if (!canEnter(step)) continue;
      // Attack after moving if enemy then adjacent
      const wouldBeAdjEnemies = enemyUnitsAdj(state, me, step);
      if (wouldBeAdjEnemies.length) {
        for (const enemy of wouldBeAdjEnemies) {
          actions.push({
            type: 'MoveAndAttack',
            unitId: u.id,
            path: [step],
            attack: { kind: 'unit', unitId: enemy.id } as Target
          });
        }
      } else {
        const enemySiteAtStep = oppView.sites.find(s => locEq(s.location, step));
        if (enemySiteAtStep) {
          actions.push({
            type: 'MoveAndAttack',
            unitId: u.id,
            path: [step],
            attack: { kind: 'site', siteId: enemySiteAtStep.id }
          });
          continue;
        }
        // Or just move (no attack field)
        actions.push({
          type: 'MoveAndAttack',
          unitId: u.id,
          path: [step],
        });
      }
    }
  }
  return actions;
}

function legalEndTurn(state: GameState, me: PlayerID): Action[] {
  if (state.activePlayer !== me) return [];
  // Allow EndTurn during main (you can always pass)
  if (state.phase === 'main' || state.phase === 'start') {
    return [{ type: 'EndTurn' as const }];
  }
  return [];
}

// -----------------------------
// Minimal simulate
// -----------------------------
function drawOneCard(next: GameState, player: PlayerID, deck: 'atlas' | 'spellbook') {
  const p = next.players[player];
  if (!p.library) p.library = { atlas: [], spellbook: [] }; // safety
  const lib = p.library[deck];
  if (lib.length === 0) {
    // Decking: opponent wins (or draw if two-player both empty by rule—pick your rule)
    const opp = otherPlayer(next, player);
    setGameOver(next, opp, `Decked on ${deck} draw`);
    return;
  }
  const cardId = lib.shift()!;           // pull top card
  p.hand[deck].push(cardId);             // add to hand
  // mark draw for this turn
  if (!next.turnFlags) next.turnFlags = {};
  next.turnFlags[player] = { ...(next.turnFlags[player] ?? {}), drewThisTurn: true };
  pushLog(next, `${player} drew 1 from ${deck}`);
}

function tapAvatar(next: GameState, player: PlayerID) {
  next.players[player].avatar.tapped = true;
}

function placeSite(next: GameState, player: PlayerID, siteCardId: string, location: Location) {
  const p = next.players[player];
  // Remove from hand
  const idx = p.hand.atlas.indexOf(siteCardId);
  if (idx >= 0) p.hand.atlas.splice(idx, 1);
  if (p.handInfo) delete p.handInfo[siteCardId];
  const info = next.cardIndex?.[siteCardId];
  const thresholds = info?.threshold ?? {};
  // Create a simple site
  const newSite: Site = {
    id: `site-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    controller: player,
    location,
    thresholds: { ...thresholds },
  };
  p.sites.push(newSite);
  const manaNow = (p.manaAvailable ?? 0) + 1;
  p.manaAvailable = manaNow;
  if (thresholds) {
    const avail = { ...(p.thresholdsAvailable ?? {}) } as Threshold;
    for (const key of ['air', 'earth', 'fire', 'water'] as (keyof Threshold)[]) {
      const value = thresholds[key] ?? 0;
      if (value) {
        avail[key] = (avail[key] ?? 0) + value;
      }
    }
    p.thresholdsAvailable = avail;
  }
}

function moveUnit(next: GameState, player: PlayerID, unitId: string, path: Location[]) {
  const u = next.players[player].units.find(x => x.id === unitId);
  if (!u) return;
  if (path.length) u.location = path[path.length - 1];
  u.tapped = true;
}

function dealCombat(next: GameState, attackerPlayer: PlayerID, unitId: string, target: Target | undefined) {
  if (!target) return;

  const me = attackerPlayer;
  const opp = otherPlayer(next, me);
  const myUnit = next.players[me].units.find(u => u.id === unitId);
  if (!myUnit || myUnit.power == null) return;

  if (target.kind === 'unit') {
    const enemy = next.players[opp].units.find(u => u.id === target.unitId);
    if (!enemy) return;
    // super naive: attacker kills enemy if attacker power >= enemy power; otherwise enemy survives
    if ((myUnit.power ?? 0) >= (enemy.power ?? 0)) {
      next.players[opp].units = next.players[opp].units.filter(u => u.id !== enemy.id);
    } else {
      // chip: reduce enemy power (placeholder)
      enemy.power = Math.max(0, (enemy.power ?? 0) - (myUnit.power ?? 0));
      if ((enemy.power ?? 0) === 0) {
        next.players[opp].units = next.players[opp].units.filter(u => u.id !== enemy.id);
      }
    }
  }
  // NOTE: add avatar/site targeting later
}

function passToNextPhaseOrPlayer(next: GameState) {
  if (next.phase === 'start') {
    // After drawing, go to main. If player never drew (no legal draws), they still can go main.
    next.phase = 'main';
    return;
  }
  if (next.phase === 'main') {
    // End turn: untap, rotate active player, reset flags
    for (const p of Object.values(next.players)) {
      p.avatar.tapped = false;
      for (const u of p.units) u.tapped = false;
    }
    const ids = Object.keys(next.players);
    const idx = ids.indexOf(next.activePlayer);
    next.activePlayer = ids[(idx + 1) % ids.length];
    next.phase = 'start';
    if (!next.turnFlags) next.turnFlags = {};
    // clear drewThisTurn for the new active player
    next.turnFlags[next.activePlayer] = { drewThisTurn: false };
    pushLog(next, `Turn passed to ${next.activePlayer}`);
  }
}


// -----------------------------
// Adapter (public)
// -----------------------------
export function createSimpleRulesAdapter(): RulesAdapter {
  return {
    getLegalActions(state: GameState, playerId: PlayerID): Action[] {
  if (state.gameOver) return [];               // <— block all actions after game end
  if (state.activePlayer !== playerId) return [];
  const actions: Action[] = [];
  actions.push(...legalDraws(state, playerId));
  actions.push(...legalSitePlays(state, playerId));
  actions.push(...legalCastMinions(state, playerId));
  actions.push(...legalMovesAndAttacks(state, playerId));
  actions.push(...legalAttacksVsAvatarOrSites(state, playerId));
  actions.push(...legalEndTurn(state, playerId));
  return actions;
},


    simulate(state: GameState, action: Action): GameState {
      const next = clone(state);
      const me = state.activePlayer;
      function summonMinion(next: GameState, player: PlayerID, cardId: string, at: Location) {
        const p = next.players[player];
        const info = (p.handInfo ?? {})[cardId] ?? next.cardIndex?.[cardId];
        const cost = info?.cost ?? 0;
        if (cost > (p.manaAvailable ?? 0)) return;
        const idx = p.hand.spellbook.indexOf(cardId);
        if (idx >= 0) p.hand.spellbook.splice(idx, 1);
        if (p.handInfo) delete p.handInfo[cardId];
        if (cost > 0) {
          p.manaAvailable = Math.max(0, (p.manaAvailable ?? 0) - cost);
        }

        const inferredPower = info?.power ?? 2;
        const keywords = info?.keywords ? [...info.keywords] : [];

        const newUnit: Unit = {
          id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          controller: player,
          cardId,
          location: at,
          tapped: true,
          canTapForAbilities: false,
          power: inferredPower,
          keywords,
        };
        p.units.push(newUnit);
      }

        function damageAvatar(next: GameState, player: PlayerID, amount: number) {
        next.players[player].avatar.life = Math.max(0, next.players[player].avatar.life - amount);
        }

      switch (action.type) {
        case 'Draw': {
            drawOneCard(next, me, action.deck);
            if (next.gameOver) return next;     // decked during draw
            if (state.phase === 'start') next.phase = 'main';
            return next;
            }
        case 'AvatarPlayOrDrawSite': {
            if (action.choice === 'play' && action.siteCardId && action.location) {
                tapAvatar(next, me);
                placeSite(next, me, action.siteCardId, action.location);
                pushLog(next, `${me} played a site`);
            }
            checkAvatarLethal(next);
            return next;
            }
        case 'CastSpell': {
            const loc = action.targets && action.targets[0] && action.targets[0].kind === 'location'
                ? action.targets[0].location : undefined;
            if (loc) {
                summonMinion(next, me, action.cardId, loc);
                pushLog(next, `${me} cast a minion: ${action.cardId}`);
            }
            checkAvatarLethal(next);
            return next;
            }

        case 'MoveAndAttack': {
            moveUnit(next, me, action.unitId, action.path ?? []);
            dealCombat(next, me, action.unitId, action.attack);
            if (action.attack && action.attack.kind === 'avatar') {
                const atk = next.players[me].units.find(u => u.id === action.unitId)?.power ?? 0;
                damageAvatar(next, action.attack.playerId, atk);
                pushLog(next, `${me} hit avatar ${action.attack.playerId} for ${atk}`);
            } else if (action.attack && action.attack.kind === 'site') {
                const opp = otherPlayer(next, me);
                const atk = next.players[me].units.find(u => u.id === action.unitId)?.power ?? 0;
                damageAvatar(next, opp, atk);
                pushLog(next, `${me} damaged an enemy site (proxy ${atk})`);
            }
            checkAvatarLethal(next);
            return next;
            }

        case 'ActivateAbility': {
          // TODO: hook into your real engine’s ability resolver
          return next;
        }
        case 'EndTurn': {
          passToNextPhaseOrPlayer(next);
          return next;
        }
        default:
          return next;
      }
    },

    isTerminalAction(action: Action): boolean {
      return action.type === 'EndTurn';
    },

    isMyTurn(state: GameState, playerId: PlayerID): boolean {
      return state.activePlayer === playerId;
    },
  };
}
