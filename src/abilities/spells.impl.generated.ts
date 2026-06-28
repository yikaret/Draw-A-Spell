/**
 * Generated spell implementations (initial set).
 * No UI components. No imports from App.tsx to avoid circular deps.
 * We call the helpers injected by App via `provideSpellHostHelpers`.
 *
 * Spells:
 *  - LIGHTNING_BOLT: 3 dmg to a unit at clicked tile (current viewRegion)
 *  - EARTHQUAKE: 1 dmg to non-Avatar units in 3×3 centered on clicked tile (surface only)
 *  - BROWSE: castBrowse(g, pid, 5, 1)
 */

import type { AbilityCtx } from './avatars';
import { registerSpells, getSpellHostHelpers, getCurrentRandomCtx } from './spells';
import { releaseAuraSourceCard } from '../aura.helpers';

/* -----------------------------------------------------------------------------
   Tiny local helpers (fallbacks when host doesn’t provide them).
   We prefer host helpers from App.tsx if available; otherwise mirror the
   structure of your state for compatibility without importing App.tsx.
----------------------------------------------------------------------------- */
// === [ADD] tiny helpers (top-of-file, after imports) =========================
function _rngId(): string { return Math.random().toString(36).slice(2, 9); }
function _pushLog(state: unknown, text: string): void {
  const s = state as { log?: string[] };
  if (s && Array.isArray(s.log)) s.log.unshift(text);
}
function _inside(g: any, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < g.width && y < g.height; }
function _cellOf(g: any, x: number, y: number) { return g.board[y][x]; }
function _unitsAtTileInRegion(g: any, x: number, y: number, region: any) {
  const cell = _cellOf(g, x, y);
  const out = (cell?.units ?? []).filter((u: any) => u.region === region && u.x === x && u.y === y);
  const index: Map<string, Set<any>> | undefined = g._multiTileIndex;
  if (index) {
    const bucket = index.get(`${x},${y},${region}`);
    if (bucket) {
      for (const unit of bucket) {
        if (!out.some((existing: any) => existing === unit)) out.push(unit);
      }
    }
  }
  return out;
}
function _regionAllowedForUnitAtCell(u: any, region: any, cell: any): boolean {
  if (!cell) return false;
  const site = cell.site;
  if (u.kind === 'Avatar') return region === 'surface' && !!site && !site.rubble;
  if (region === 'surface') return !!site && !site.rubble;
  if (region === 'void') return !!u.voidwalk && !cell.site;
  if (region === 'underground') return !!u.burrowing && !!site && !site.isWater;
  if (region === 'underwater') return !!u.submerge && !!site && !!site.isWater;
  return false;
}
function _nearbyLocations(g: any, u: any): Array<{ x: number; y: number; region: any }> {
  const curR = u.region;
  const dirs: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
  const diag: Array<[number, number]> = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const steps: Array<[number, number]> = [...dirs, ...((u.airborne && curR === 'surface') ? diag : [])];
  const out: Array<{ x: number; y: number; region: any }> = [];
  for (const [dx, dy] of steps) {
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (!_inside(g, nx, ny)) continue;
    const cell = _cellOf(g, nx, ny);
    if (_regionAllowedForUnitAtCell(u, curR, cell)) out.push({ x: nx, y: ny, region: curR });
  }
  return out;
}
function _ensureMultiTileLocations(u: any): Array<{ x: number; y: number; region: any }> {
  if (!Array.isArray(u._multiTileLocations)) u._multiTileLocations = [];
  return u._multiTileLocations;
}
function _clearMultiTileIndex(g: any, unit: any): void {
  const index: Map<string, Set<any>> | undefined = g._multiTileIndex;
  if (!index) return;
  for (const [key, set] of Array.from(index.entries())) {
    if (set.delete(unit) && set.size === 0) index.delete(key);
  }
  for (const row of g.board || []) {
    for (const cell of row || []) {
      if (cell?.units?.length > 0) {
        cell.units = cell.units.filter((u: any) => u !== unit);
      }
    }
  }
}
function _syncMultiTileIndex(g: any, unit: any): void {
  const tiles: Array<{ x: number; y: number; region: any }> | undefined = unit._multiTileLocations;
  if (!Array.isArray(tiles)) {
    _clearMultiTileIndex(g, unit);
    return;
  }
  const index: Map<string, Set<any>> = g._multiTileIndex ?? (g._multiTileIndex = new Map());
  _clearMultiTileIndex(g, unit);
  for (const tile of tiles) {
    if (!_inside(g, tile.x, tile.y)) continue;
    const key = `${tile.x},${tile.y},${tile.region}`;
    const bucket = index.get(key) ?? new Set<any>();
    bucket.add(unit);
    index.set(key, bucket);
    const cell = _cellOf(g, tile.x, tile.y);
    if (!cell.units) cell.units = [];
    if (!cell.units.some((u: any) => u === unit)) cell.units.push(unit);
  }
}
function _moveUnitTo(g: any, u: any, x: number, y: number, region: any): void {
  const prev = _cellOf(g, u.x, u.y);
  if (prev?.units) prev.units = prev.units.filter((v: any) => v.id !== u.id);
  const owner = u?.player;
  const source = (g as any)._forceMoveSourcePid ?? owner;
  if (owner != null && source != null && owner !== source && _oldSaltAnchorsUnitLocal(g, u)) {
    _pushLog(g, `${u.name ?? 'The minion'} refuses to budge while the Old Salt Anchorman stands nearby.`);
    if (prev?.units) prev.units.push(u);
    return;
  }
  u.x = x; u.y = y; u.region = region;
  const next = _cellOf(g, x, y); (next.units ??= []).push(u);
  if (u?.id && Array.isArray(g.artifacts)) {
    for (const art of g.artifacts) {
      if (art.carriedBy === u.id) {
        art.x = x;
        art.y = y;
        art.region = region;
      }
    }
  }
  if (u && u._tringhConstrictee) {
    u._tringhConstrictee.x = x;
    u._tringhConstrictee.y = y;
    u._tringhConstrictee.region = region;
  }
  let multiChanged = false;
  if (u && typeof u.name === 'string' && /^(?:Megamoeba)$/i.test(u.name)) {
    const tiles = _ensureMultiTileLocations(u);
    if (!tiles.some((t: any) => t.x === x && t.y === y && t.region === region)) {
      tiles.push({ x, y, region });
    } else {
      for (const t of tiles) if (t.x === x && t.y === y) t.region = region;
    }
    multiChanged = true;
  }
  if (u?.size2x2) {
    const tiles = _ensureMultiTileLocations(u);
    tiles.length = 0;
    const variants = [
      { x, y, region },
      { x: x + 1, y, region },
      { x, y: y + 1, region },
      { x: x + 1, y: y + 1, region },
    ];
    for (const tile of variants) {
      if (_inside(g, tile.x, tile.y)) tiles.push(tile);
    }
    multiChanged = true;
  }
  if (multiChanged) _syncMultiTileIndex(g, u);
}
function _findUnitById(g: any, id: string): any | null {
  if (!id) return null;
  for (const row of g.board || []) {
    for (const cell of row || []) {
      if (!cell?.units) continue;
      for (const unit of cell.units) {
        if ((unit as any)?.id === id) return unit;
      }
    }
  }
  return null;
}
function _oldSaltAnchorsUnitLocal(g: any, unit: any): boolean {
  const owner = unit?.player;
  if (owner == null) return false;
  const region = ((unit?.region ?? 'surface') as any);
  const ux = unit?.x;
  const uy = unit?.y;
  if (!Number.isFinite(ux) || !Number.isFinite(uy)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = ux + dx;
    const ny = uy + dy;
    if (!_inside(g, nx, ny)) continue;
    const cell = _cellOf(g, nx, ny);
    for (const other of cell?.units ?? []) {
      if (other?.player !== owner) continue;
      if (!/^Old Salt Anchorman$/i.test(other?.name ?? '')) continue;
      const r = (other?.region ?? 'surface');
      if (r !== region) continue;
      return true;
    }
  }
  return false;
}
function _drawFromSpellbook(g: any, pid: any, n = 1): number {
  let taken = 0;
  for (let i = 0; i < n; i++) {
    const card = g.decks?.[pid]?.spellbook?.shift?.();
    if (!card) break;
    const hand = g.handSpells[pid] ?? (g.handSpells[pid] = []);
    hand.push(card);
    taken++;
  }
  const helpers = getSpellHostHelpers() as any;
  if (taken > 0 && helpers?.requestGameSync) helpers.requestGameSync();
  return taken;
}

function _pushSpellToHandLocal(g: any, pid: any, card: any): void {
  if (!card) return;
  const hand = g.handSpells?.[pid] ?? (g.handSpells[pid] = []);
  hand.push(card);
  const helpers = getSpellHostHelpers() as any;
  if (helpers?.requestGameSync) helpers.requestGameSync();
}

function _drawFromAtlas(g: any, pid: any, n = 1): number {
  let taken = 0;
  for (let i = 0; i < n; i++) {
    const card = g.decks?.[pid]?.atlas?.shift?.();
    if (!card) break;
    const hand = g.handAtlas?.[pid] ?? (g.handAtlas[pid] = []);
    hand.push(card);
    taken++;
  }
  const helpers = getSpellHostHelpers() as any;
  if (taken > 0 && helpers?.requestGameSync) helpers.requestGameSync();
  return taken;
}

function _unitHasSubtype(u: any, name: string): boolean {
  if (!u) return false;
  const match = (value: any) =>
    typeof value === 'string' && value.trim().toLowerCase() === name.trim().toLowerCase();
  const list = Array.isArray(u.subTypes) ? u.subTypes : Array.isArray(u?.cardSubTypes) ? u.cardSubTypes : [];
  if (list.some(match)) return true;
  const src = (u as any)._srcCard;
  if (src && Array.isArray(src.subTypes) && src.subTypes.some(match)) return true;
  return false;
}

function _isCpuPlayerLocal(g: any, pid: any): boolean {
  const cpuId = (g?._cpuPlayerId ?? 2);
  if (g?._opponentType === 'cpu' && String(pid) === String(cpuId)) return true;
  if (typeof pid === 'string' && pid.startsWith('cpu')) return true;
  return false;
}

function _drawOneWithChoiceLocal(g: any, pid: any, label: string): boolean {
  const spellbookLeft = g.decks?.[pid]?.spellbook?.length ?? 0;
  const atlasLeft = g.decks?.[pid]?.atlas?.length ?? 0;
  if (spellbookLeft === 0 && atlasLeft === 0) return false;

  if (_isCpuPlayerLocal(g, pid)) {
    if (spellbookLeft > 0) return _drawFromSpellbook(g, pid, 1) > 0;
    if (atlasLeft > 0) return _drawFromAtlas(g, pid, 1) > 0;
    return false;
  }

  const options: string[] = [];
  if (spellbookLeft > 0) options.push(`1) Spellbook (${spellbookLeft} remaining)`);
  if (atlasLeft > 0) options.push(`2) Atlas (${atlasLeft} remaining)`);
  options.push('0 = stop');

  const preferred = spellbookLeft > 0 ? '1' : atlasLeft > 0 ? '2' : '0';
  const ans = typeof window !== 'undefined'
    ? window.prompt(`${label}\n${options.join('\n')}`, preferred)
    : null;
  const choice = ans != null ? parseInt(ans, 10) : 0;
  if (choice === 1 && spellbookLeft > 0) return _drawFromSpellbook(g, pid, 1) > 0;
  if (choice === 2 && atlasLeft > 0) return _drawFromAtlas(g, pid, 1) > 0;
  return false;
}

function _isMortalUnit(u: any): boolean {
  return _unitHasSubtype(u, 'Mortal');
}

function _isDemonOrUndead(u: any): boolean {
  return _unitHasSubtype(u, 'Demon') || _unitHasSubtype(u, 'Undead');
}

function _isSpellcasterUnitLocal(g: any, u: any): boolean {
  if (!u) return false;
  if (u.kind === 'Avatar') return true;
  if (u.spellcaster) return true;
  const src = (u as any)._srcCard;
  if (src?.spellcaster) return true;
  if (typeof u.name === 'string' && /spire lich/i.test(u.name)) {
    if (u.region === 'surface') {
      try {
        const cell = cellOfBoard(g, u.x, u.y);
        const siteName = cell?.site?.name ?? '';
        if (/tower/i.test(siteName)) return true;
      } catch {
        /* no-op */
      }
    }
  }
  return false;
}

function _randomIndex(count: number, context?: string, labels?: string[]): number {
  const helpers = getSpellHostHelpers();
  if (helpers?.chooseRandomIndex) {
    const ctx = getCurrentRandomCtx();
    const controllerPid = ctx?.pid as number | undefined;
    try {
      const idx = helpers.chooseRandomIndex({ count, context, labels, controllerPid });
      if (Number.isFinite(idx) && idx >= 0 && idx < count) return idx;
    } catch {
      /* ignore helper failure */
    }
  }
  return Math.floor(Math.random() * count);
}

function _randomElement<T>(arr: readonly T[], context?: string, labels?: string[]): T | undefined {
  if (!arr.length) return undefined;
  const idx = _randomIndex(arr.length, context, labels);
  return arr[Math.min(arr.length - 1, Math.max(0, idx))];
}

function _chooseCardinalDirection(label: string, exclude: string[] = []): 'N' | 'S' | 'E' | 'W' | null {
  const allowed: Array<'N' | 'S' | 'E' | 'W'> = (['N', 'S', 'E', 'W'] as const).filter(
    (dir) => !exclude.some((e) => e.toUpperCase() === dir)
  ) as Array<'N' | 'S' | 'E' | 'W'>;
  if (allowed.length === 0) return null;

  const promptLabel = `${label}\nOptions: ${allowed.join(', ')}`;
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    const ans = window.prompt(promptLabel, allowed[0]);
    if (!ans) return null;
    const dir = ans.trim().toUpperCase();
    if (dir === 'N' || dir === 'S' || dir === 'E' || dir === 'W') {
      if (exclude.some((e) => e.toUpperCase() === dir)) return null;
      return dir;
    }
    return null;
  }

  return allowed[0] ?? null;
}


function _chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function _cloneDeep<T>(value: T): T {
  if (typeof (globalThis as any).structuredClone === 'function') {
    return (globalThis as any).structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function _shuffleInPlace(arr: any[], context?: string): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = _randomIndex(i + 1, context);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function _scorchedEarthRazeSite(g: any, pid: any, x: number, y: number): string | null {
  if (!insideBoard(g, x, y)) return null;
  const cell = cellOfBoard(g, x, y);
  if (!cell) return null;
  const site = cell.site;
  if (!site || site.rubble) return null;
  if (site.controller !== pid) return null;

  const siteName = site.name ?? 'the site';
  site.rubble = true;
  site.controller = null;
  site.justPlaced = false;

  const units = Array.isArray(cell.units) ? [...cell.units] : [];
  for (const unit of units) {
    if (!unit) continue;
    if (unit.kind === 'Avatar') {
      const life = typeof unit.life === 'number' ? unit.life : 0;
      if (life > 0) damage(g, unit, life, { sourceElement: 'Fire' });
      else damage(g, unit, 1, { sourceElement: 'Fire' });
      continue;
    }
    const lethal = Math.max(1, unitThresholdHPPlus(g, unit));
    damage(g, unit, lethal, { sourceElement: 'Fire' });
  }

  for (let i = Array.isArray(g.artifacts) ? g.artifacts.length - 1 : -1; i >= 0; i--) {
    const art = g.artifacts[i];
    if (!art) continue;
    if (art.x !== x || art.y !== y) continue;
    if (art.carriedBy) {
      const carrier = g.board?.flat?.().flatMap((c: any) => c.units || []).find((u: any) => u.id === art.carriedBy);
      if (carrier && Array.isArray((carrier as any).carrying)) {
        (carrier as any).carrying = (carrier as any).carrying.filter((id: string) => id !== art.id);
      }
    }
    const artifactCell = g.board?.[art.y]?.[art.x];
    if (artifactCell && Array.isArray(artifactCell.artifacts)) {
      artifactCell.artifacts = artifactCell.artifacts.filter((entry: any) => entry.id !== art.id);
    }
    g.artifacts.splice(i, 1);
  }

  if (Array.isArray(cell.artifacts)) {
    cell.artifacts = cell.artifacts.filter((art: any) => !(art.x === x && art.y === y));
  }

  return siteName;
}

function findCaster(g: any, pid: any): any {
  const last = (g as any)._lastCasterId;
  if (last) {
    const unit = g.board?.flat?.().flatMap((c: any) => c.units || []).find((u: any) => u.id === last);
    if (unit) return unit;
  }
  return g.avatars?.[pid];
}

function removeAuraFromBoard(g: any, auraId: string): void {
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const cell = g.board?.[y]?.[x];
      if (!cell?.auraIds) continue;
      if (cell.auraIds.includes(auraId)) {
        cell.auraIds = cell.auraIds.filter((id: string) => id !== auraId);
      }
    }
  }
}

function artifactCarriedBy(g: any, unit: any, name: string): any | null {
  const id = unit?.id;
  if (!id) return null;
  return (g.artifacts || []).find((a: any) => a.carriedBy === id && a.name === name) || null;
}

function unitHasLethalLocal(g: any, unit: any): boolean {
  return !!unit?.lethal || !!artifactCarriedBy(g, unit, 'Poisonous Dagger');
}

function ignoreStealthLocal(g: any, unit: any): boolean {
  return !!artifactCarriedBy(g, unit, 'Truesight Crossbow');
}

function lethalAmountLocal(g: any, source: any, target: any, base: number): number {
  if (!unitHasLethalLocal(g, source)) return base;
  const threshold = Math.max(1, target?.def ?? target?.power ?? 1);
  return Math.max(base, threshold);
}

function unitThresholdHPPlus(g: any, unit: any): number {
  const h = getSpellHostHelpers() as any;
  if (h && typeof h.unitThresholdHPPlus === 'function') return h.unitThresholdHPPlus(g, unit);
  if (!unit) return 1;
  const temp = (unit as any)._tempPowerBonus ?? 0;
  if (unit.kind === 'Avatar') {
    const base = typeof unit.power === 'number' ? unit.power : 0;
    return Math.max(1, base + temp);
  }
  let base = typeof unit.def === 'number' ? unit.def : typeof unit.power === 'number' ? unit.power : 1;
  if (typeof unit.name === 'string' && /spire lich/i.test(unit.name)) {
    try {
      const cell = cellOfBoard(g, unit.x, unit.y);
      const siteName = cell?.site?.name ?? '';
      if (/tower/i.test(siteName)) base += 2;
    } catch {
      /* ignore */
    }
  }
  return Math.max(1, base + temp);
}


function unitsAtTileInRegion(g: any, x: number, y: number, region: any): any[] {
  const h = getSpellHostHelpers() as any;
  if (h && typeof h.unitArrayAtRegion === 'function') return h.unitArrayAtRegion(g, x, y, region);
  const cell = g.board?.[y]?.[x];
  if (!cell) return [];
  return cell.units.filter((u: any) => u.x === x && u.y === y && u.region === region);
}

function _forceDropArtifacts(g: any, unit: any): number {
  if (!unit || !unit.id) return 0;
  const cell = cellOfBoard(g, unit.x, unit.y);
  if (!cell) return 0;
  let dropped = 0;
  for (const art of g.artifacts ?? []) {
    if (!art || art.carriedBy !== unit.id) continue;
    art.carriedBy = null;
    art.x = unit.x;
    art.y = unit.y;
    art.region = unit.region ?? 'surface';
    if (!Array.isArray(cell.artifacts)) cell.artifacts = [];
    if (!cell.artifacts.some((a: any) => a?.id === art.id)) cell.artifacts.push(art);
    dropped += 1;
  }
  if (Array.isArray((unit as any).carrying)) {
    (unit as any).carrying = (unit as any).carrying.filter((id: string) => {
      const art = (g.artifacts ?? []).find((a: any) => a.id === id);
      return art && art.carriedBy === unit.id;
    });
  }
  const helpers = getSpellHostHelpers() as any;
  if (helpers?.refreshUnitArtifactPassives) {
    try { helpers.refreshUnitArtifactPassives(g, unit); } catch { /* ignore */ }
  }
  return dropped;
}

function _unitRarity(unit: any): string {
  const raw = (unit?.rarity ?? (unit as any)?._srcCard?.rarity ?? '').toString();
  return raw.trim().toLowerCase();
}

function _opponentPid(g: any, pid: any): any {
  const keys = Object.keys(g?.avatars ?? {})
    .map((k) => Number(k))
    .filter((n) => n !== pid);
  if (keys.length > 0) return keys[0];
  return pid === 1 ? 2 : 1;
}

function _currentTurnNumber(g: any): number {
  return typeof g?.turnNumber === 'number' ? g.turnNumber : 0;
}

function _tokenFromCard(card: any, pid: any, x: number, y: number, region: any): any {
  const token: any = {
    id: _rngId(),
    kind: 'Token',
    name: card.name,
    element: card.element ?? card.elements?.[0] ?? 'Earth',
    player: pid,
    x,
    y,
    region,
    tapped: false,
    power: card.power ?? card.atk ?? card.def ?? 0,
    atk: card.atk,
    def: card.def,
    airborne: card.airborne,
    burrowing: card.burrowing,
    submerge: card.submerge,
    voidwalk: card.voidwalk,
    movementPlus: card.movementPlus,
    ranged: card.ranged,
    stealth: card.stealth,
    lethal: card.lethal,
    spellcaster: (card as any).spellcaster,
    provides: (card as any).provides ? [...(card as any).provides] : undefined,
    providesGeneric: (card as any).providesGeneric,
    carrying: [],
    summonedThisTurn: true,
    damage: 0,
    image: card.image,
    subTypes: (card as any).subTypes ? [...(card as any).subTypes] : undefined,
    size2x2: (card as any).size2x2 ? true : undefined,
  };
  token._srcCard = card;
  return token;
}
function _canGainStealth(unit: any): boolean {
  if (!unit) return false;
  if (unit.kind === 'Avatar') return false;
  return !((unit as any)._permanentStealthLoss);
}
function insideBoard(g: any, x: number, y: number): boolean {
  const h = getSpellHostHelpers() as any;
  if (h && typeof h.inside === 'function') return h.inside(g, x, y);
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}
function cellOfBoard(g: any, x: number, y: number): any {
  const h = getSpellHostHelpers() as any;
  if (h && typeof h.cellOf === 'function') return h.cellOf(g, x, y);
  return g.board[y][x];
}
function damage(g: any, u: any, amount: number, opts?: { sourceElement?: string }): void {
  const h = getSpellHostHelpers() as any;
  if (h && typeof h.damageUnit === 'function') { h.damageUnit(g, u, amount, opts); return; }
  // Very small fallback (engine will supply real damageUnit via host).
  u.damage = (u.damage ?? 0) + amount;
  (g.log || []).unshift?.(`${u.name} takes ${amount} damage.`);
}
function neighbors8(g: any, x: number, y: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const out: Array<[number, number]> = [];
  for (const [dx,dy] of pts) {
    const nx = x + dx;
    const ny = y + dy;
    if (insideBoard(g, nx, ny)) out.push([nx, ny]);
  }
  return out;
}
function pickRandom<T>(arr: T[]): T | undefined {
  return _randomElement(arr);
}

function pushLog(state: unknown, text: string): void {
  const s = state as { log?: string[] };
  if (s && Array.isArray(s.log)) s.log.unshift(text);
}

function _meteorHitTile(
  g: any,
  pid: any,
  x: number,
  y: number,
  region: any,
  damageAmount: number,
  enemiesOnly: boolean
): number {
  if (!insideBoard(g, x, y)) return 0;
  const units = unitsAtTileInRegion(g, x, y, region).filter((unit: any) => {
    if (enemiesOnly) return unit.player !== pid;
    return true;
  });
  for (const unit of units) {
    damage(g, unit, damageAmount, { sourceElement: 'Fire' });
  }
  return units.length;
}

function _meteorShowerStage(
  g: any,
  pid: any,
  stage: number,
  x: number,
  y: number,
  region: any
): number {
  if (stage <= 1) {
    const centre = _meteorHitTile(g, pid, x, y, region, 7, false);
    const orthDirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let orthHits = 0;
    for (const [dx, dy] of orthDirs) {
      orthHits += _meteorHitTile(g, pid, x + dx, y + dy, region, 5, false);
    }
    const diagDirs: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    let diagHits = 0;
    for (const [dx, dy] of diagDirs) {
      diagHits += _meteorHitTile(g, pid, x + dx, y + dy, region, 3, false);
    }
    const total = centre + orthHits + diagHits;
    g.log.unshift(
      `Meteor Shower impact #1 devastates (${x + 1}, ${y + 1}) — ${total} unit(s) scorched.`
    );
    g.log.unshift('Meteor Shower — choose the second impact site.');
    return 2;
  }

  if (stage === 2) {
    const centre = _meteorHitTile(g, pid, x, y, region, 4, false);
    const orthDirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let orthHits = 0;
    for (const [dx, dy] of orthDirs) {
      orthHits += _meteorHitTile(g, pid, x + dx, y + dy, region, 2, false);
    }
    const total = centre + orthHits;
    g.log.unshift(
      `Meteor Shower impact #2 batters (${x + 1}, ${y + 1}) — ${total} unit(s) are blasted.`
    );
    g.log.unshift('Meteor Shower — choose the final impact site.');
    return 3;
  }

  const hits = _meteorHitTile(g, pid, x, y, region, 3, false);
  g.log.unshift(
    `Meteor Shower finale obliterates ${hits} unit(s) at (${x + 1}, ${y + 1}).`
  );
  return 0;
}

function tilesOfAura2x2Local(g: any, anchor: { x: number; y: number }): Array<{ x: number; y: number }> {
  const { x, y } = anchor;
  const pts: Array<{ x: number; y: number }> = [];
  if (x >= 0 && y >= 0 && x + 1 < g.width && y + 1 < g.height) {
    pts.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
  }
  return pts;
}

function siteUnderDroughtLocal(g: any, x: number, y: number): boolean {
  return Array.isArray(g.auras) && g.auras.some(
    (a: any) =>
      a?.effect?.drought &&
      tilesOfAura2x2Local(g, a.anchor ?? { x: -1, y: -1 }).some((t) => t.x === x && t.y === y)
  );
}

function isSiteWaterLocal(g: any, site: any, x: number, y: number): boolean {
  if (!site) return false;
  if (!site.isWater) return false;
  if (siteUnderDroughtLocal(g, x, y)) return false;
  return true;
}

function burrowUnitLocal(g: any, unit: any, cell: any): boolean {
  if (!_regionAllowedForUnitAtCell(unit, 'underground', cell)) return false;
  const ux = typeof unit.x === 'number' ? unit.x : (unit as any).x;
  const uy = typeof unit.y === 'number' ? unit.y : (unit as any).y;
  if (ux == null || uy == null) return false;
  _moveUnitTo(g, unit, ux, uy, 'underground');
  unit.tapped = true;
  if (unit.kind !== 'Avatar') unit.interactedThisTurn = true;
  return true;
}

function burrowArtifactLocal(art: any): boolean {
  if (!art) return false;
  art.region = 'underground';
  return true;
}

function killUnitForRegionLocal(
  g: any,
  unit: any,
  region: 'underground' | 'underwater' | 'void',
  reason?: string
): void {
  const name = unit?.name ?? 'The unit';
  const descriptor = region === 'underwater' ? 'underwater' : region === 'underground' ? 'underground' : 'in the void';
  pushLog(g, reason ?? `${name} cannot survive ${descriptor} and dies.`);
  const element = region === 'underwater' ? 'Water' : region === 'underground' ? 'Earth' : undefined;
  damage(g, unit, 999, element ? { sourceElement: element } : undefined);
  const helpers = getSpellHostHelpers() as any;
  if (helpers?.requestGameSync) helpers.requestGameSync();
}

function forceBurrowUnitLocal(
  g: any,
  unit: any,
  cell: any,
  reason?: string
): boolean {
  if (burrowUnitLocal(g, unit, cell)) return true;
  killUnitForRegionLocal(g, unit, 'underground', reason);
  return false;
}

function forceSubmergeUnitLocal(
  g: any,
  unit: any,
  x: number,
  y: number,
  cell: any,
  reason?: string
): boolean {
  if (_regionAllowedForUnitAtCell(unit, 'underwater', cell)) {
    _moveUnitTo(g, unit, x, y, 'underwater');
    if (Array.isArray(unit._multiTileLocations)) {
      for (const tile of unit._multiTileLocations) tile.region = 'underwater';
      _syncMultiTileIndex(g, unit);
    }
    unit.tapped = true;
    if (unit.kind !== 'Avatar') unit.interactedThisTurn = true;
    return true;
  }
  killUnitForRegionLocal(g, unit, 'underwater', reason);
  return false;
}

function cloneCardForHandLocal(card: any): any {
  const copy = _cloneDeep(card);
  if (copy && (copy as any).id !== undefined) (copy as any).id = _rngId();
  else if (copy) (copy as any).id = _rngId();
  return copy;
}

function releaseCarriedMinionsLocal(g: any, carrier: any, cell: any): void {
  const carried = carrier?._carriedMinions;
  if (!Array.isArray(carried) || carried.length === 0) return;
  for (const minion of carried) {
    if (!minion) continue;
    delete minion.carriedBy;
    const x = typeof carrier.x === 'number' ? carrier.x : (carrier as any).x;
    const y = typeof carrier.y === 'number' ? carrier.y : (carrier as any).y;
    const region = carrier.region ?? 'surface';
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minion.x = x;
      minion.y = y;
      minion.region = region;
      minion.tapped = true;
      minion.summonedThisTurn = true;
      (cell.units ??= []).push(minion);
      if (Array.isArray(minion._multiTileLocations)) {
        for (const tile of minion._multiTileLocations) tile.region = region;
        _syncMultiTileIndex(g, minion);
      }
    }
  }
  carrier._carriedMinions = [];
}

function releaseSwallowedUnitsLocal(g: any, container: any, cell: any): void {
  const stored = container?._swallowedUnits;
  if (!Array.isArray(stored) || stored.length === 0) return;
  const x = typeof container.x === 'number' ? container.x : (container as any).x;
  const y = typeof container.y === 'number' ? container.y : (container as any).y;
  const region = container.region ?? 'surface';
  for (const captive of stored) {
    if (!captive) continue;
    delete captive._swallowedBy;
    captive.x = x;
    captive.y = y;
    captive.region = region;
    captive.tapped = true;
    captive.summonedThisTurn = true;
    (cell.units ??= []).push(captive);
    if (Array.isArray(captive._multiTileLocations)) {
      for (const tile of captive._multiTileLocations) tile.region = region;
      _syncMultiTileIndex(g, captive);
    }
  }
  container._swallowedUnits = [];
}

function clearConstrictionLinksLocal(g: any, unit: any, cell: any): void {
  if (unit?._tringhConstrictee) {
    const hold = unit._tringhConstrictee;
    const captive = hold?.unit;
    if (captive) {
      delete captive._constrictedBy;
      captive.x = hold.x;
      captive.y = hold.y;
      captive.region = hold.region ?? (unit.region ?? 'surface');
      captive.tapped = true;
      captive.summonedThisTurn = true;
      (cell.units ??= []).push(captive);
      if (Array.isArray(captive._multiTileLocations)) {
        for (const tile of captive._multiTileLocations) tile.region = captive.region;
        _syncMultiTileIndex(g, captive);
      }
    }
    unit._tringhConstrictee = undefined;
  }
  if (unit?._constrictedBy) {
    const constrictor = _findUnitById(g, unit._constrictedBy);
    if (constrictor) constrictor._tringhConstrictee = undefined;
    unit._constrictedBy = undefined;
  }
}

function returnUnitToHandLocal(g: any, unit: any): boolean {
  if (!unit || unit.kind === 'Avatar') return false;
  const owner = unit.player;
  const src = unit._srcCard;
  const ux = typeof unit.x === 'number' ? unit.x : (unit as any).x;
  const uy = typeof unit.y === 'number' ? unit.y : (unit as any).y;
  const region = unit.region ?? 'surface';
  if (!Number.isFinite(ux) || !Number.isFinite(uy)) return false;
  const cell = cellOfBoard(g, ux, uy);

  if (unit.carriedBy) {
    const carrier = _findUnitById(g, unit.carriedBy);
    if (carrier && Array.isArray(carrier.carrying)) {
      carrier.carrying = carrier.carrying.filter((id: string) => id !== unit.id);
    }
  }
  unit.carriedBy = undefined;

  for (const artId of unit.carrying ?? []) {
    const art = (g.artifacts || []).find((a: any) => a.id === artId);
    if (!art) continue;
    art.carriedBy = null;
    art.x = ux;
    art.y = uy;
    art.region = region;
    (cell.artifacts ??= []).push(art);
  }
  unit.carrying = [];

  releaseCarriedMinionsLocal(g, unit, cell);
  releaseSwallowedUnitsLocal(g, unit, cell);
  clearConstrictionLinksLocal(g, unit, cell);

  if (Array.isArray(unit._multiTileLocations)) {
    for (const tile of unit._multiTileLocations) tile.region = region;
  }
  _clearMultiTileIndex(g, unit);
  cell.units = (cell.units || []).filter((u: any) => u.id !== unit.id);

  if (owner == null || !src) return false;
  const hand = g.handSpells?.[owner] ?? (g.handSpells[owner] = []);
  const card = cloneCardForHandLocal(src);
  hand.push(card);
  return true;
}

function returnArtifactToHandLocal(g: any, art: any): boolean {
  if (!art) return false;
  const owner = art.player;
  if (art.carriedBy) {
    const carrier = _findUnitById(g, art.carriedBy);
    if (carrier && Array.isArray(carrier.carrying)) {
      carrier.carrying = carrier.carrying.filter((id: string) => id !== art.id);
      const base = (carrier as any)._artifactBase;
      if (base) {
        carrier.airborne = base.airborne;
        carrier.burrowing = base.burrowing;
        carrier.submerge = base.submerge;
        carrier.voidwalk = base.voidwalk;
        carrier.movementPlus = base.movementPlus;
        carrier.ranged = base.ranged;
        carrier.stealth = base.stealth;
        carrier.lethal = base.lethal;
        carrier.spellcaster = base.spellcaster;
        carrier.charge = base.charge;
        carrier.hasLance = base.hasLance;
        carrier.strikeFirst = base.strikeFirst;
      }
    }
    art.carriedBy = null;
  }

  if (Number.isFinite(art.x) && Number.isFinite(art.y) && insideBoard(g, art.x, art.y)) {
    const cell = cellOfBoard(g, art.x, art.y);
    if (cell?.artifacts) cell.artifacts = cell.artifacts.filter((entry: any) => entry.id !== art.id);
  }

  if (Array.isArray(g.artifacts)) {
    const idx = g.artifacts.findIndex((a: any) => a.id === art.id);
    if (idx >= 0) g.artifacts.splice(idx, 1);
  }

  if (owner == null) return false;
  const hand = g.handSpells?.[owner] ?? (g.handSpells[owner] = []);
  const src = art._srcCard;
  if (src) {
    hand.push(cloneCardForHandLocal(src));
  } else {
    hand.push({
      id: _rngId(),
      kind: 'ArtifactCard',
      name: art.name,
      element: art.element ?? undefined,
      cost: art.cost ?? 0,
      text: art.text ?? undefined,
      image: art.image,
      subTypes: Array.isArray(art.subTypes) ? [...art.subTypes] : undefined,
    });
  }
  return true;
}

function _countWaterBodySitesLocal(g: any, x: number, y: number): number {
  const cell = cellOfBoard(g, x, y);
  const site = cell?.site;
  if (!isSiteWaterLocal(g, site, x, y)) return 0;
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const seen = new Set<string>([key(x, y)]);
  const queue: Array<{ x: number; y: number }> = [{ x, y }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!insideBoard(g, nx, ny)) continue;
      const other = cellOfBoard(g, nx, ny).site;
      if (!isSiteWaterLocal(g, other, nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen.size;
}

function _healAvatarLifeLocal(g: any, pid: any, amount: number): number {
  if (amount <= 0) return 0;
  const avatar = g.avatars?.[pid];
  if (!avatar) return 0;
  if (avatar.deathsDoor) return 0;
  const before = avatar.life ?? 0;
  avatar.life = Math.min(20, Math.max(0, before + amount));
  if (avatar.life > 0) {
    avatar.deathsDoor = false;
    if (g.protectedDD) g.protectedDD[pid] = false;
    delete (avatar as any)._deathDoorTurn;
  }
  return avatar.life - before;
}

function _healTokenDamageLocal(unit: any, amount: number): number {
  if (!unit || amount <= 0) return 0;
  const current = unit.damage ?? 0;
  if (current <= 0) return 0;
  const healed = Math.min(current, amount);
  unit.damage = current - healed;
  return healed;
}

export function installGeneratedSpells(): void {
  registerSpells([
    // -----------------------------------------------------------------------
    // Existing baseline implementations (mirror your helpers)
    // -----------------------------------------------------------------------
    
    {
      code: 'LIGHTNING_BOLT',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const h = getSpellHostHelpers();
        if (!h) { pushLog(ctx.state, 'Lightning Bolt could not resolve: helpers not provided.'); return; }
        h.castLightningBolt(ctx.state as any, ctx.pid as any, params.x, params.y);
      },
    },
    {
      code: 'EARTHQUAKE',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const h = getSpellHostHelpers();
        if (!h) { pushLog(ctx.state, 'Earthquake could not resolve: helpers not provided.'); return; }
        h.castEarthquake(ctx.state as any, ctx.pid as any, params.x, params.y);
      },
    },
    {
      code: 'BROWSE',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const h = getSpellHostHelpers();
        if (!h) { pushLog(ctx.state, 'Browse could not resolve: helpers not provided.'); return; }
        h.castBrowse(ctx.state as any, ctx.pid as any, 5, 1);
      },
    },

    {
      code: 'CRATERIZE',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const helpers = getSpellHostHelpers();
        if (!helpers || typeof helpers.castCraterize !== 'function') {
          pushLog(g, 'Craterize could not resolve: helpers not provided.');
          return;
        }
        helpers.castCraterize(g, pid, params.x, params.y);
      },
    },
    

    // -----------------------------------------------------------------------
    // New codes
    // -----------------------------------------------------------------------

    {
      code: 'CALL_TO_WAR',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const deck: any[] = g.decks?.[pid]?.spellbook;
        if (!Array.isArray(deck) || deck.length === 0) {
          pushLog(g, 'Call to War finds no cards in the spellbook.');
          return;
        }
        const matches = deck
          .map((card, index) => ({ card, index }))
          .filter(({ card }) => {
            if (!card || card.kind !== 'Unit') return false;
            const rarity = String(card.rarity ?? '').toLowerCase();
            if (rarity !== 'exceptional') return false;
            const subs = Array.isArray(card.subTypes) ? card.subTypes : [];
            return subs.some((s: any) => typeof s === 'string' && /mortal/i.test(s));
          });
        if (matches.length === 0) {
          pushLog(g, 'Call to War finds no Exceptional Mortal to recruit.');
          return;
        }

        let choice = matches[0];
        if (matches.length > 1) {
          const menu = matches
            .map((entry, i) => `${i + 1}) ${entry.card.name}`)
            .join('\n');
          const ans = window.prompt(
            `Call to War — choose an Exceptional Mortal:\n${menu}\n0 = cancel`,
            '1'
          );
          const idx = ans ? parseInt(ans, 10) : 0;
          if (!Number.isFinite(idx) || idx <= 0 || idx > matches.length) {
            pushLog(g, 'Call to War search cancelled.');
            return;
          }
          choice = matches[idx - 1];
        }

        const [picked] = deck.splice(choice.index, 1);
        _pushSpellToHandLocal(g, pid, picked);
        pushLog(g, `Call to War reveals ${picked.name} and adds it to hand.`);
        _shuffleInPlace(deck);
        pushLog(g, 'Spellbook shuffled.');
      },
    },

    {
      code: 'COMMON_SENSE',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const deck: any[] = g.decks?.[pid]?.spellbook;
        if (!Array.isArray(deck) || deck.length === 0) {
          pushLog(g, 'Common Sense finds no cards in the spellbook.');
          return;
        }
        const matches = deck
          .map((card, index) => ({ card, index }))
          .filter(({ card }) => String(card?.rarity ?? '').toLowerCase() === 'ordinary');

        if (matches.length === 0) {
          pushLog(g, 'Common Sense finds no Ordinary card to draw.');
          return;
        }

        let choice = matches[0];
        if (matches.length > 1) {
          const menu = matches
            .map((entry, i) => `${i + 1}) ${entry.card.name}`)
            .join('\n');
          const ans = window.prompt(
            `Common Sense — choose an Ordinary card:\n${menu}\n0 = cancel`,
            '1'
          );
          const idx = ans ? parseInt(ans, 10) : 0;
          if (!Number.isFinite(idx) || idx <= 0 || idx > matches.length) {
            pushLog(g, 'Common Sense search cancelled.');
            return;
          }
          choice = matches[idx - 1];
        }

        const [picked] = deck.splice(choice.index, 1);
        _pushSpellToHandLocal(g, pid, picked);
        pushLog(g, `Common Sense reveals ${picked.name} and adds it to hand.`);
        const helpers = getSpellHostHelpers() as any;
        if (helpers?.requestGameSync) helpers.requestGameSync();
        _shuffleInPlace(deck);
        pushLog(g, 'Spellbook shuffled.');
      },
    },

    {
      code: 'ASSORTED_ANIMALS',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const deck: any[] | undefined = g.decks?.[pid]?.spellbook;
        if (!Array.isArray(deck) || deck.length === 0) {
          pushLog(g, 'Assorted Animals finds no cards in the spellbook.');
          return;
        }

        const beasts = deck
          .map((card, index) => ({ card, index }))
          .filter(({ card }) => {
            if (!card || card.kind !== 'Unit') return false;
            const subs = Array.isArray(card.subTypes) ? card.subTypes : [];
            return subs.some((s: any) => typeof s === 'string' && /beast/i.test(s));
          });

        if (beasts.length === 0) {
          pushLog(g, 'Assorted Animals finds no Beasts to recruit.');
          return;
        }

        const manaAvailable = Number(g.mana?.[pid] ?? 0);
        const maxX = Math.max(0, manaAvailable);
        let x = 0;

        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
          const ans = window.prompt(
            `Assorted Animals — choose X (0–${maxX}):`,
            String(Math.min(3, maxX))
          );
          if (ans == null) {
            pushLog(g, 'Assorted Animals cancelled.');
            return;
          }
          const parsed = parseInt(ans, 10);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxX) {
            pushLog(g, 'Assorted Animals cancelled (invalid X).');
            return;
          }
          x = parsed;
        } else {
          x = maxX;
        }

        if (x > 0) {
          g.mana[pid] = manaAvailable - x;
        }
        pushLog(g, `Assorted Animals resolves with X = ${x}.`);

        let remaining = x;
        const picks: Array<{ card: any; index: number }> = [];
        let pool = beasts.slice();
        const chosenNames = new Set<string>();

        const selectAuto = () => {
          const choice = pool.reduce<{ card: any; index: number } | null>((best, cur) => {
            const cost = typeof cur.card.cost === 'number' ? cur.card.cost : 0;
            if (cost > remaining) return best;
            if (chosenNames.has((cur.card.name ?? '').toLowerCase())) return best;
            if (!best) return cur;
            const bestCost = typeof best.card.cost === 'number' ? best.card.cost : 0;
            return cost > bestCost ? cur : best;
          }, null);
          if (!choice) return false;
          picks.push(choice);
          remaining -= typeof choice.card.cost === 'number' ? choice.card.cost : 0;
          chosenNames.add((choice.card.name ?? '').toLowerCase());
          pool = pool.filter((entry) => entry.card.name !== choice.card.name);
          return true;
        };

        while (remaining > 0 && pool.length > 0) {
          if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
            if (!selectAuto()) break;
            continue;
          }

          const options = pool.filter((entry) => {
            const cost = typeof entry.card.cost === 'number' ? entry.card.cost : 0;
            if (cost > remaining) return false;
            return !picks.some(
              (picked) =>
                typeof picked.card?.name === 'string' &&
                typeof entry.card?.name === 'string' &&
                picked.card.name.toLowerCase() === entry.card.name.toLowerCase()
            );
          });

          if (options.length === 0) break;

          if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
            const choice = options.reduce<{ card: any; index: number } | null>((best, cur) => {
              const curCost = typeof cur.card.cost === 'number' ? cur.card.cost : 0;
              if (!best) return cur;
              const bestCost = typeof best.card.cost === 'number' ? best.card.cost : 0;
              return curCost > bestCost ? cur : best;
            }, null);
            if (!choice) break;
            picks.push(choice);
            remaining -= typeof choice.card.cost === 'number' ? choice.card.cost : 0;
            pool = pool.filter((entry) => entry.card.name !== choice.card.name);
            continue;
          }

          const menu = options
            .map(
              (entry, i) =>
                `${i + 1}) ${entry.card.name} — Cost ${typeof entry.card.cost === 'number' ? entry.card.cost : 0}`
            )
            .join('\n');
          const sel = window.prompt(
            `Assorted Animals — remaining mana ${remaining}.\n${menu}\n0 = finish`,
            '1'
          );
          if (sel == null) break;
          const pickIndex = parseInt(sel, 10);
          if (!Number.isFinite(pickIndex) || pickIndex < 0 || pickIndex > options.length) {
            pushLog(g, 'Assorted Animals selection cancelled.');
            break;
          }
          if (pickIndex === 0) break;
          const choice = options[pickIndex - 1];
          const cost = typeof choice.card.cost === 'number' ? choice.card.cost : 0;
          if (cost > remaining) {
            pushLog(g, `${choice.card.name} exceeds the remaining X. Choose again.`);
            continue;
          }
          picks.push(choice);
          remaining -= cost;
          chosenNames.add((choice.card.name ?? '').toLowerCase());
          pool = pool.filter((entry) => entry.card.name !== choice.card.name);
        }

        if (picks.length === 0) {
          pushLog(g, 'Assorted Animals takes no cards.');
          _shuffleInPlace(deck);
          pushLog(g, 'Spellbook shuffled.');
          return;
        }

        const ordered = picks.slice().sort((a, b) => b.index - a.index);
        const revealed: string[] = [];
        for (const entry of ordered) {
          const [card] = deck.splice(entry.index, 1);
          if (card) {
            _pushSpellToHandLocal(g, pid, card);
            revealed.push(card.name ?? 'Unknown Beast');
          }
        }
        if (revealed.length > 0) {
          pushLog(g, `Assorted Animals reveals ${revealed.join(', ')} and adds them to hand.`);
        } else {
          pushLog(g, 'Assorted Animals takes no cards.');
        }
        _shuffleInPlace(deck);
        pushLog(g, 'Spellbook shuffled.');
      },
    },

    {
      code: 'MINECART_MADNESS',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const cell = g.board?.[params.y]?.[params.x];
        if (!cell?.site || cell.site.rubble || isSiteWaterLocal(g, cell.site, params.x, params.y)) {
          pushLog(g, 'Minecart Madness requires selecting a land site.');
          return;
        }

        const pending = g._pendingMinecartMadness as
          | { pid: any; start: { x: number; y: number } }
          | undefined;

        if (!pending || pending.pid !== pid) {
          g._pendingMinecartMadness = { pid, start: { x: params.x, y: params.y } };
          pushLog(
            g,
            `Minecart Madness: start site selected at (${params.x + 1}, ${params.y + 1}). Choose another site in the same row or column.`
          );
          return;
        }

        const start = pending.start;
        if (start.x === params.x && start.y === params.y) {
          pushLog(g, 'Minecart Madness: choose a different site to define the span.');
          return;
        }

        const deltaX = params.x - start.x;
        const deltaY = params.y - start.y;
        const stepX = deltaX === 0 ? 0 : deltaX > 0 ? 1 : -1;
        const stepY = deltaY === 0 ? 0 : deltaY > 0 ? 1 : -1;
        if (stepX !== 0 && stepY !== 0) {
          pushLog(g, 'Minecart Madness span must follow a straight line (row or column).');
          return;
        }
        if (stepX === 0 && stepY === 0) {
          pushLog(g, 'Minecart Madness: choose a second site to outline the span.');
          return;
        }

        const tiles: Array<{ x: number; y: number }> = [];
        let cx = start.x;
        let cy = start.y;
        while (true) {
          const spanCell = cellOfBoard(g, cx, cy);
          if (!spanCell?.site || spanCell.site.rubble || isSiteWaterLocal(g, spanCell.site, cx, cy)) {
            pushLog(g, 'Minecart Madness requires the entire span to be land sites without rubble.');
            return;
          }
          tiles.push({ x: cx, y: cy });
          if (cx === params.x && cy === params.y) break;
          cx += stepX;
          cy += stepY;
          if (!insideBoard(g, cx, cy)) {
            pushLog(g, 'Minecart Madness: sites must remain on the board.');
            return;
          }
        }

        if (tiles.length < 2) {
          pushLog(g, 'Minecart Madness span must include at least two sites.');
          return;
        }

        const existing: Array<{ pid: any; tiles: Array<{ x: number; y: number }>; turnNumber: number; keys: string[] }> =
          Array.isArray(g._minecartMadness) ? g._minecartMadness : [];
        const turnNumber = typeof g.turnNumber === 'number' ? g.turnNumber : 0;
        const fresh = existing.filter(
          (entry) => entry && typeof entry.turnNumber === 'number' && entry.turnNumber === turnNumber && entry.pid !== pid
        );
        fresh.push({
          pid,
          tiles,
          turnNumber,
          keys: tiles.map((t) => `${t.x},${t.y}`),
        });
        g._minecartMadness = fresh;
        delete g._pendingMinecartMadness;

        const first = tiles[0];
        const last = tiles[tiles.length - 1];
        pushLog(
          g,
          `Minecart Madness lays tracks across ${tiles.length} site(s) from (${first.x + 1},${first.y + 1}) to (${last.x + 1},${last.y + 1}).`
        );
      },
    },

    {
      code: 'WARP_SPASM',
      targeting: 'click-unit',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const region = g.viewRegion;
        const units = unitsAtTileInRegion(g, params.x, params.y, region);
        const target = units.find((u: any) => u.player === pid && u.kind !== 'Avatar');
        if (!target) {
          pushLog(g, 'Warp Spasm requires targeting a friendly minion.');
          return;
        }
        if ((target as any)._warpSpasm) {
          pushLog(g, `${target.name} is already seized by Warp Spasm.`);
          return;
        }
        const token = target as any;
        const basePower =
          typeof token.power === 'number'
            ? token.power
            : typeof token.atk === 'number'
              ? token.atk
              : 0;
        const existingBonus = typeof token._tempPowerBonus === 'number' ? token._tempPowerBonus : 0;
        const gainedBonus = basePower + existingBonus;
        token._tempPowerBonus = existingBonus + gainedBonus;
        token._warpSpasm = { owner: pid, bonus: gainedBonus };
        pushLog(
          g,
          `Warp Spasm wracks ${target.name} — its power doubles and it will die at end of turn.`
        );
      },
    },

    {
      code: 'METEOR_SHOWER',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const region = g.viewRegion;
        const tracker = (g as any)._meteorShower as { pid: any; stage: number } | undefined;
        const stage = tracker && tracker.pid === pid ? tracker.stage : 1;
        const nextStage = _meteorShowerStage(g, pid, stage, params.x, params.y, region);
        if (nextStage > 0) (g as any)._meteorShower = { pid, stage: nextStage };
        else delete (g as any)._meteorShower;
      },
    },

    {
      code: 'CAVE_IN',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state;
        const tx = params.x;
        const ty = params.y;
        const cell = cellOfBoard(g, tx, ty);
        if (!cell) { pushLog(g, 'Cave-In: invalid tile.'); return; }
        const site = cell.site;
        if (!site || site.rubble) { pushLog(g, 'Cave-In: there is no standing site here.'); return; }
        if (isSiteWaterLocal(g, site, tx, ty)) {
          pushLog(g, 'Cave-In requires a land site.');
          return;
        }

        const surfaceUnits = (cell.units ?? []).filter((u: any) => u.region === 'surface' && u.kind !== 'Avatar');
        let burrowedUnits = 0;
        let crushedUnits = 0;
        for (const unit of surfaceUnits) {
          if (forceBurrowUnitLocal(g, unit, cell, `Cave-In crushes ${unit.name} — it cannot burrow.`)) burrowedUnits += 1;
          else crushedUnits += 1;
        }

        const surfaceArtifacts = (cell.artifacts ?? []).filter((a: any) => !a.carriedBy && a.region === 'surface');
        let burrowedArtifacts = 0;
        for (const art of surfaceArtifacts) {
          if (burrowArtifactLocal(art)) {
            art.x = tx;
            art.y = ty;
            burrowedArtifacts += 1;
          }
        }

        if (burrowedUnits === 0 && burrowedArtifacts === 0 && crushedUnits === 0) {
          pushLog(g, `Cave-In at (${tx + 1}, ${ty + 1}) finds nothing able to burrow.`);
        } else {
          const parts: string[] = [];
          if (burrowedUnits > 0 || burrowedArtifacts > 0) {
            parts.push(`burrowing ${burrowedUnits} minion(s) and ${burrowedArtifacts} artifact(s)`);
          }
          if (crushedUnits > 0) {
            parts.push(`crushing ${crushedUnits} minion(s)`);
          }
          const detail = parts.length ? `, ${parts.join(' and ')}` : '';
          pushLog(g, `Cave-In collapses (${tx + 1}, ${ty + 1})${detail}.`);
        }
      },
    },

    {
      code: 'SHIELD_WALL',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const turnNumber = typeof g.turnNumber === 'number' ? g.turnNumber : 0;
        const existing: Array<{ pid: any; expiresTurnNumber: number }> =
          Array.isArray(g._shieldWall) ? g._shieldWall : [];
        const cleaned = existing.filter(
          (entry) => entry && typeof entry.expiresTurnNumber === 'number' && entry.expiresTurnNumber >= turnNumber
        ).filter((entry) => entry.pid !== pid);
        cleaned.push({ pid, expiresTurnNumber: turnNumber + 1 });
        g._shieldWall = cleaned;
        pushLog(g, 'Shield Wall fortifies your allies until your next turn.');
      },
    },

    {
      code: 'BORDER_MILITIA',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const g: any = ctx.state;
        const pid: any = ctx.pid;
        const width = g.width ?? 0;
        const height = g.height ?? 0;
        let spawned = 0;
        const enemyTargets = new Set<string>();

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cell = g.board?.[y]?.[x];
            if (!cell) continue;
            const site = cell.site;
            if (!site || site.rubble || site.controller !== pid) continue;

            const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dy] of dirs) {
              const nx = x + dx;
              const ny = y + dy;
              if (!insideBoard(g, nx, ny)) continue;
              const neighborSite = g.board?.[ny]?.[nx]?.site;
              if (neighborSite && !neighborSite.rubble && neighborSite.controller != null && neighborSite.controller !== pid) {
                enemyTargets.add(`${nx},${ny}`);
              }
            }
          }
        }

        for (const key of enemyTargets) {
          const [sx, sy] = key.split(',').map(n => parseInt(n, 10));
          if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
          const cell = g.board?.[sy]?.[sx];
          const site = cell?.site;
          if (!cell || !site || site.rubble || site.controller == null || site.controller === pid) continue;

          const token = {
            id: _rngId(),
            kind: 'Token',
            name: 'Foot Soldier',
            element: g.avatars?.[pid]?.element ?? 'Earth',
            player: pid,
            x: sx,
            y: sy,
            region: 'surface',
            tapped: false,
            power: 1,
            damage: 0,
            carrying: [],
            summonedThisTurn: true,
            subTypes: ['Soldier', 'Mortal'],
            image: '/assets/Foot_Soldier.png',
          };
          (cell.units ??= []).push(token);
          spawned += 1;
        }

        if (spawned === 0) {
          pushLog(g, 'Border Militia finds no enemy border sites to reinforce.');
        } else {
          pushLog(g, `Border Militia summons ${spawned} Foot Soldier token(s) to enemy border sites.`);
        }
      },
    },

    {
      code: 'BURY',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state;
        const tx = params.x;
        const ty = params.y;
        const region = g.viewRegion ?? 'surface';
        const cell = cellOfBoard(g, tx, ty);
        if (!cell) { pushLog(g, 'Bury: invalid tile.'); return; }
        const units = (cell.units ?? []).filter((u: any) => u.region === region && u.kind !== 'Avatar');
        const artifacts = (cell.artifacts ?? []).filter((a: any) => a.region === region && !a.carriedBy);

        const options: Array<{ kind: 'unit' | 'artifact'; ref: any }> = [
          ...units.map((u: any) => ({ kind: 'unit' as const, ref: u })),
          ...artifacts.map((a: any) => ({ kind: 'artifact' as const, ref: a })),
        ];

        if (options.length === 0) {
          pushLog(g, 'Bury: no eligible minion or artifact here.');
          return;
        }

        let choice = options[0];
        if (options.length > 1) {
          const menu = options
            .map((opt, i) =>
              `${i + 1}) ${opt.kind === 'unit' ? opt.ref.name : `${opt.ref.name} (artifact)`}`
            )
            .join('\n');
          const ans = window.prompt(`Bury — choose a target to burrow:\n${menu}\n0 = cancel`, '1');
          const idx = ans ? parseInt(ans, 10) : 0;
          if (!Number.isFinite(idx) || idx <= 0 || idx > options.length) {
            pushLog(g, 'Bury cancelled.');
            return;
          }
          choice = options[idx - 1];
        }

        if (choice.kind === 'unit') {
          if (forceBurrowUnitLocal(g, choice.ref, cell, `Bury crushes ${choice.ref.name} — it cannot burrow.`)) {
            pushLog(g, `Bury forces ${choice.ref.name} underground.`);
          }
        } else {
          const success = burrowArtifactLocal(choice.ref);
          if (success) {
            choice.ref.x = tx;
            choice.ref.y = ty;
            pushLog(g, `Bury sinks ${choice.ref.name} beneath the site.`);
          } else {
            pushLog(g, `${choice.ref.name} cannot be burrowed.`);
          }
        }
        return true;
      },
    },

    // --- CHAIN_LIGHTNING ---
    // Click a tile: hit a random unit there for 2, then repeatedly:
    // if you have at least (2) mana and there exists a *new* unit in the
    // 8-neighborhood of the most recent target, auto-spend (2) and hit it
    // for 2 as well. No UI prompts; uses current viewRegion.
    {
      code: 'CHAIN_LIGHTNING',
      targeting: 'click-unit',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state as any;
        const region = g.viewRegion;
        const units = unitsAtTileInRegion(g, params.x, params.y, region);
        const target = units[0];
        if (!target) { pushLog(g, 'Chain Lightning: no unit at that tile.'); return; }

        damage(g, target, 2);
        pushLog(g, `Chain Lightning hits ${target.name} for 2.`);

        // Hand control back to App.tsx for OPTIONAL paid chains via follow-up clicks.
        (g as any)._chainLightning = {
          pid: ctx.pid,
          last: { x: target.x, y: target.y, region },
          seenIds: [target.id],
        };
        pushLog(g, 'Spend (2) and click a NEW nearby unit to chain; click elsewhere to end.');
      },
    },

    // --- THUNDERSTORM ---
    // Click a tile: spawns a storm marker that, at the end of YOUR turns,
    // deals 3 to a random unit at its tile, then drifts 1 step (8‑dir), for 3 turns.
    // (A tiny endTurn hook in App.tsx makes it tick.)
    {
      code: 'THUNDERSTORM',
      targeting: 'click-tile',
      resolve(ctx: AbilityCtx, params) {
        if (params.kind !== 'click') return;
        const g: any = ctx.state as any;
        const pid: any = ctx.pid as any;
        (g as any)._thunderstorms ??= [];
        (g as any)._thunderstorms.push({ pid, x: params.x, y: params.y, remaining: 3 });
        pushLog(g, `Thunderstorm brews over (${params.x + 1},${params.y + 1}). It will strike at the end of your turns (3×).`);
      },
    },

    // --- ALBESPINE_PIKEMEN ---
    // Minion; not a spell. Keep as a no-op so code mapping remains stable.
    {
      code: 'ALBESPINE_PIKEMEN',
      targeting: 'none',
      resolve(ctx: AbilityCtx) {
        const g: any = ctx.state as any;
        pushLog(g, 'Albespine Pikemen is a unit. No spell to resolve.');
      },
    },
  ]);
}
// --- extra registrations (append-only; do NOT nest inside another registerSpells([...])) ---
registerSpells([
  {
    code: 'APPRENTICE_WIZARD',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
    const pid: any = ctx.pid;
      const av = g.avatars?.[pid]; if (!av) return;
      const cell = g.board[av.y][av.x];
      const token = {
        id: Math.random().toString(36).slice(2, 9),
        kind: 'Token' as const, name: 'Apprentice Wizard', element: 'Air',
        player: pid, x: av.x, y: av.y, region: 'surface', tapped: false,
        power: 1, atk: 1, def: 1, carrying: [] as string[], summonedThisTurn: true,
      };
      cell.units.push(token);
      g.log.unshift(`Apprentice Wizard is summoned at (${av.x + 1}, ${av.y + 1}).`);
      const card = g.decks?.[pid]?.spellbook?.shift?.();
      if (card) { (g.handSpells[pid] ??= []).push(card); g.log.unshift('Genesis — draw 1 spell.'); }
    },
  },

  {
    code: 'GRANDMASTER_WIZARD',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
    const pid: any = ctx.pid;
      const av = g.avatars?.[pid]; if (!av) return;
      const cell = g.board[av.y][av.x];
      const token = {
        id: Math.random().toString(36).slice(2, 9),
        kind: 'Token' as const, name: 'Grandmaster Wizard', element: 'Air',
        player: pid, x: av.x, y: av.y, region: 'surface', tapped: false,
        power: 0, atk: 0, def: 0, carrying: [] as string[], summonedThisTurn: true,
      };
      cell.units.push(token);
      g.log.unshift(`Grandmaster Wizard is summoned at (${av.x + 1}, ${av.y + 1}).`);
      let drew = 0;
      for (let i = 0; i < 3; i++) {
        const c = g.decks?.[pid]?.spellbook?.shift?.(); if (!c) break;
        (g.handSpells[pid] ??= []).push(c); drew++;
      }
      g.log.unshift(drew ? `Genesis — draw ${drew} spell(s).` : 'Genesis — no spells to draw.');
    },
  },
  // Fireball & Avatar of Fire Secondary Ability //
  {
  code: 'FIREBALL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    const h = getSpellHostHelpers() as any;
    if (!h || typeof h.fireballProjectile !== 'function') {
      pushLog(g, 'Fireball could not resolve: helpers not provided.');
      return;
    }

    // Use last caster if set by your casting path; otherwise fall back to avatar
    const lastId = (g as any)._lastCasterId;
    const caster =
      g.board.flat().flatMap((c: any) => c.units).find((u: any) => u.id === lastId) ||
      g.avatars[pid];

    // Determine cardinal direction from caster to clicked tile
    const dx = params.x - caster.x;
    const dy = params.y - caster.y;
    const dir: 'N' | 'S' | 'E' | 'W' =
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'E' : 'W') : (dy >= 0 ? 'S' : 'N');

    h.fireballProjectile(
      g,
      pid,
      { x: caster.x, y: caster.y, region: caster.region },
      dir
    );
  },
},
  // Blink — click-unit; derive the unit from the clicked tile in current viewRegion
  {
  code: 'BLINK',
  // Click a friendly unit; then choose a nearby legal destination; draw 1 spell after moving.
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state as any;
    const pid: any = ctx.pid as any;
    const region = g.viewRegion;

    // Derive clicked unit in current viewRegion; pick first friendly
    const unitsAtTile =
      g.board?.[params.y]?.[params.x]?.units?.filter(
        (u: any) => u.x === params.x && u.y === params.y && u.region === region
      ) ?? [];
    const unit = unitsAtTile.find((u: any) => u.player === pid);
    if (!unit) { g.log.unshift('Blink fizzles — no friendly unit at the clicked tile.'); return; }

    // Defer destination choice to App.tsx on next click
    (g as any)._pendingBlink = { pid, unitId: unit.id };
    g.log.unshift(`Blink: choose a nearby legal destination for ${unit.name}.`);
  },
},

  // Attack by Night — enemies drop artifacts; your allies strike first this turn
  {
    code: 'ATTACK_BY_NIGHT',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const opponent = _opponentPid(g, pid);
      let dropped = 0;
      let affected = 0;
      for (const row of g.board ?? []) {
        for (const cell of row ?? []) {
          for (const unit of cell?.units ?? []) {
            if (unit?.player == null) continue;
            if (unit.player === pid) continue;
            if (opponent != null && unit.player !== opponent) continue;
            const count = _forceDropArtifacts(g, unit);
            if (count > 0) {
              dropped += count;
              affected += 1;
            }
          }
        }
      }
      if (dropped > 0) pushLog(g, `Attack by Night disarms ${affected} enemy unit(s), dropping ${dropped} artifact(s).`);
      else pushLog(g, 'Attack by Night finds no enemy artifacts to drop.');
      const turn = _currentTurnNumber(g);
      const map = (g as any)._strikeFirstThisTurn ?? ((g as any)._strikeFirstThisTurn = {});
      map[pid] = turn;
      pushLog(g, 'Allied units strike first this turn.');
    },
  },

  // Ball Lightning — bouncing projectile: 4 → 2 → 1 along rotating directions
  {
    code: 'BALL_LIGHTNING',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Ball Lightning fizzles — no caster found.'); return; }
      const dir = _chooseCardinalDirection('Ball Lightning — choose initial direction (N,S,E,W):');
      if (!dir) { pushLog(g, 'Ball Lightning dissipates without a direction.'); return; }
      const rotate: Record<string, 'N' | 'S' | 'E' | 'W'> = { N: 'E', E: 'S', S: 'W', W: 'N' };
      const deltas: Record<'N' | 'S' | 'E' | 'W', [number, number]> = {
        N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
      };
      let curDir: 'N' | 'S' | 'E' | 'W' = dir;
      let { x, y } = caster as any;
      const region = (caster as any).region ?? g.viewRegion ?? 'surface';
      const stages = [4, 2, 1];
      for (const dmg of stages) {
        let hit: any = null;
        while (insideBoard(g, x + deltas[curDir][0], y + deltas[curDir][1])) {
          x += deltas[curDir][0];
          y += deltas[curDir][1];
          const units = unitsAtTileInRegion(g, x, y, region).filter((u: any) => !(u as any).stealth);
          if (units.length === 0) continue;
          hit = units[0];
          break;
        }
        if (!hit) { pushLog(g, `Ball Lightning flies ${curDir} but finds no target.`); break; }
        damage(g, hit, dmg, { sourceElement: 'Air' });
        pushLog(g, `Ball Lightning zaps ${hit.name} for ${dmg} at (${x + 1}, ${y + 1}).`);
        curDir = rotate[curDir];
      }
    },
  },

  // Feast for Crows — name a spell; purge it from opponent zones and banish copies
  {
    code: 'FEAST_FOR_CROWS',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const opponent = _opponentPid(g, pid);
      if (opponent == null) { pushLog(g, 'Feast for Crows has no opponent to target.'); return; }
      const wormelowBlocks = (() => {
        try {
          if (!Array.isArray(g.board)) return false;
          for (const row of g.board as any[]) {
            for (const cell of row ?? []) {
              const site = cell?.site;
              if (!site || site.rubble) continue;
              if (site.controller !== opponent) continue;
              if (/^Wormelow Tump$/i.test(site.name ?? '')) return true;
            }
          }
        } catch {}
        return false;
      })();
      if (wormelowBlocks) { pushLog(g, 'Feast for Crows fizzles — Wormelow Tump protects that cemetery.'); return; }

      const spellbook: any[] = g.decks?.[opponent]?.spellbook ?? [];
      const cemetery: any[] = g.cemetery?.[opponent] ?? [];
      const hand: any[] = g.handSpells?.[opponent] ?? [];
      const options = Array.from(
        new Set(
          [...spellbook, ...cemetery, ...hand]
            .filter((c) => c?.kind === 'Spell' && c.name)
            .map((c) => String(c.name))
        )
      );

      const suggested = options[0] ?? '';
      const ans = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt('Feast for Crows — name a spell:', suggested)
        : suggested;
      if (!ans) { pushLog(g, 'Feast for Crows cancelled.'); return; }
      const targetName = ans.trim().toLowerCase();
      if (!targetName) { pushLog(g, 'Feast for Crows cancelled.'); return; }

      const banished: any[] = [];
      const match = (card: any) => card?.kind === 'Spell' && String(card.name ?? '').toLowerCase() === targetName;

      for (let i = hand.length - 1; i >= 0; i--) {
        if (match(hand[i])) banished.push(hand.splice(i, 1)[0]);
      }
      for (let i = spellbook.length - 1; i >= 0; i--) {
        if (match(spellbook[i])) banished.push(spellbook.splice(i, 1)[0]);
      }
      for (let i = cemetery.length - 1; i >= 0; i--) {
        if (match(cemetery[i])) banished.push(cemetery.splice(i, 1)[0]);
      }

      if (banished.length === 0) {
        pushLog(g, `Feast for Crows finds no copies of "${ans}".`);
      } else {
        if (!g.banished) g.banished = { 1: [], 2: [] } as any;
        const zone = g.banished[opponent] ?? (g.banished[opponent] = []);
        for (const card of banished) zone.push(_cloneDeep(card));
        pushLog(g, `Feast for Crows banishes ${banished.length} copy/copies of "${ans}".`);
      }
      _shuffleInPlace(spellbook, 'FeastForCrows');
      pushLog(g, 'Opponent shuffles their spellbook.');
    },
  },

  // King's Council — draw for each Unique ally
  {
    code: 'KING_S_COUNCIL',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      let count = 0;
      for (const row of g.board ?? []) {
        for (const cell of row ?? []) {
          for (const unit of cell?.units ?? []) {
            if (unit?.player !== pid) continue;
            if (_unitRarity(unit) === 'unique') count += 1;
          }
        }
      }
      if (count <= 0) { pushLog(g, "King's Council — no Unique allies to advise."); return; }
      const drawn = _drawFromSpellbook(g, pid, count);
      pushLog(g, drawn > 0
        ? `King's Council draws ${drawn} card(s) for ${count} Unique ally/allies.`
        : "King's Council finds no spells to draw.");
    },
  },

  // Pendragon Legacy — recycle Unique cards from your cemetery, then draw
  {
    code: 'PENDRAGON_LEGACY',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const cemetery: any[] = g.cemetery?.[pid] ?? [];
      if (!Array.isArray(cemetery) || cemetery.length === 0) {
        pushLog(g, 'Pendragon Legacy finds no cards in your cemetery.');
        _drawFromSpellbook(g, pid, 1);
        return;
      }
      const toReturn: any[] = [];
      for (let i = cemetery.length - 1; i >= 0; i--) {
        const card = cemetery[i];
        if (card && _unitRarity(card) === 'unique') {
          toReturn.push(card);
          cemetery.splice(i, 1);
        }
      }
      if (toReturn.length === 0) {
        pushLog(g, 'Pendragon Legacy finds no Unique cards to recycle.');
      } else {
        const spellbook: any[] = g.decks?.[pid]?.spellbook ?? (g.decks[pid].spellbook = []);
        const atlas: any[] = g.decks?.[pid]?.atlas ?? (g.decks[pid].atlas = []);
        for (const card of toReturn) {
          if (card?.kind === 'Site') atlas.push(card);
          else spellbook.push(card);
        }
        _shuffleInPlace(spellbook, 'PendragonLegacy:Spellbook');
        _shuffleInPlace(atlas, 'PendragonLegacy:Atlas');
        pushLog(g, `Pendragon Legacy shuffles ${toReturn.length} Unique card(s) back into your decks.`);
      }
      const drawn = _drawFromSpellbook(g, pid, 1);
      if (drawn === 0) pushLog(g, 'Pendragon Legacy draw step finds no spells.');
    },
  },

  // Power of Flight — grant Airborne until your next turn; draw a spell
  {
    code: 'POWER_OF_FLIGHT',
    targeting: 'click-unit',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const region = g.viewRegion ?? 'surface';
      const units = unitsAtTileInRegion(g, params.x, params.y, region)
        .filter((u: any) => u.kind !== 'Avatar' && u.player === pid);
      if (units.length === 0) { pushLog(g, 'Power of Flight: click an allied minion.'); return; }
      const target = units[0];
      const prev = !!target.airborne;
      target.airborne = true;
      const buffs = (g as any)._tempFlightBuffs ?? ((g as any)._tempFlightBuffs = []);
      buffs.push({ unitId: target.id, prevAirborne: prev, expireTurn: _currentTurnNumber(g) + 1 });
      pushLog(g, `${target.name} takes wing until your next turn.`);
      const drawn = _drawFromSpellbook(g, pid, 1);
      if (drawn === 0) pushLog(g, 'Power of Flight draw step finds no spells.');
    },
  },

  // Grievous Insult — silence and tap a nearby enemy; draw a spell
  {
    code: 'GRIEVOUS_INSULT',
    targeting: 'click-unit',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const region = g.viewRegion ?? 'surface';
      const targets = unitsAtTileInRegion(g, params.x, params.y, region)
        .filter((u: any) => u.kind !== 'Avatar' && u.player !== pid);
      if (targets.length === 0) { pushLog(g, 'Grievous Insult: target an enemy minion.'); return; }
      const target = targets[0];
      const caster = findCaster(g, pid);
      if (caster) {
        const dist = _chebyshev((caster as any).x ?? 0, (caster as any).y ?? 0, target.x, target.y);
        if (dist > 1) {
          pushLog(g, 'Grievous Insult requires a nearby enemy.');
          return;
        }
      }
      target.tapped = true;
      if (target.kind !== 'Avatar') target.interactedThisTurn = true;
      const map = (g as any)._tempSilencedUnits ?? ((g as any)._tempSilencedUnits = {});
      map[target.id] = _currentTurnNumber(g);
      pushLog(g, `${target.name} is silenced and tapped for the turn.`);
      const drawn = _drawFromSpellbook(g, pid, 1);
      if (drawn === 0) pushLog(g, 'Grievous Insult draw step finds no spells.');
  },
},

  // Burning Hands — pick two distinct directions; 2 Fire damage to adjacent tiles
  {
    code: 'BURNING_HANDS',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Burning Hands fizzles — no caster found.'); return; }
      if (!_isMortalUnit(caster)) { pushLog(g, 'Burning Hands requires an allied Mortal to cast.'); return; }
      const dirA = _chooseCardinalDirection('Burning Hands — choose first direction (N,S,E,W):');
      if (!dirA) { pushLog(g, 'Burning Hands cancelled (no first direction).'); return; }
      const dirB = _chooseCardinalDirection('Burning Hands — choose second (different) direction:', [dirA]);
      if (!dirB) { pushLog(g, 'Burning Hands cancelled (no second direction).'); return; }
      const deltas: Record<'N' | 'S' | 'E' | 'W', [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
      const region = (caster as any).region ?? g.viewRegion ?? 'surface';
      let hits = 0;
      for (const dir of [dirA, dirB]) {
        const [dx, dy] = deltas[dir];
        const tx = (caster as any).x + dx;
        const ty = (caster as any).y + dy;
        if (!insideBoard(g, tx, ty)) continue;
        const units = unitsAtTileInRegion(g, tx, ty, region);
        for (const u of units) {
          damage(g, u, 2, { sourceElement: 'Fire' });
          hits++;
        }
      }
      if (hits === 0) pushLog(g, 'Burning Hands scorches empty air.');
      else pushLog(g, `Burning Hands sears ${hits} unit(s).`);
    },
  },

  // Firebreathing — Beast/Dragon breath line for 3 Fire damage
  {
    code: 'FIREBREATHING',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Firebreathing fizzles — no caster found.'); return; }
      if (!_unitHasSubtype(caster, 'Beast') && !_unitHasSubtype(caster, 'Dragon')) {
        pushLog(g, 'Firebreathing requires a Beast or Dragon to cast.');
        return;
      }
      const dir = _chooseCardinalDirection('Firebreathing — choose a direction (N,S,E,W):');
      if (!dir) { pushLog(g, 'Firebreathing cancelled.'); return; }
      const deltas: Record<'N' | 'S' | 'E' | 'W', [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
      const [dx, dy] = deltas[dir];
      let x = (caster as any).x;
      let y = (caster as any).y;
      const region = (caster as any).region ?? g.viewRegion ?? 'surface';
      let hits = 0;
      for (let step = 0; step < 3; step++) {
        x += dx; y += dy;
        if (!insideBoard(g, x, y)) break;
        const units = unitsAtTileInRegion(g, x, y, region);
        for (const u of units) {
          damage(g, u, 3, { sourceElement: 'Fire' });
          hits++;
        }
      }
      if (hits === 0) pushLog(g, `Firebreathing gouts flame ${dir} but hits nothing.`);
      else pushLog(g, `Firebreathing scorches ${hits} unit(s) ${dir}.`);
    },
  },

  // Joust! — swap adjacent units; if swapped, they trade blows
  {
    code: 'JOUST',
    targeting: 'click-unit',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Joust! fizzles — no caster found.'); return; }
      const region = (caster as any).region ?? g.viewRegion ?? 'surface';
      const target = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.player !== pid);
      if (!target) { pushLog(g, 'Joust!: target an adjacent enemy.'); return; }
      const dist = _chebyshev((caster as any).x ?? 0, (caster as any).y ?? 0, target.x, target.y);
      if (dist !== 1) { pushLog(g, 'Joust! requires adjacency.'); return; }
      const casterPos = { x: (caster as any).x, y: (caster as any).y, region };
      const targetPos = { x: target.x, y: target.y, region };
      _moveUnitTo(g, caster, targetPos.x, targetPos.y, region);
      _moveUnitTo(g, target, casterPos.x, casterPos.y, region);
      const casterPower = Math.max(0, (caster as any).power ?? (caster as any).atk ?? 0);
      const targetPower = Math.max(0, (target as any).power ?? (target as any).atk ?? 0);
      if (casterPower > 0) damage(g, target, casterPower);
      if (targetPower > 0) damage(g, caster, targetPower);
      pushLog(g, `Joust! swaps positions; ${caster.name} and ${target.name} trade blows.`);
    },
  },

  // Knighthood — if you control an Ordinary Mortal, deploy a Knight/Sir/Dame from hand there
  {
    code: 'KNIGHTHOOD',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const mortals: any[] = [];
      for (const row of g.board ?? []) for (const cell of row ?? []) {
        for (const unit of cell?.units ?? []) {
          if (unit?.player !== pid) continue;
          if (!_isMortalUnit(unit)) continue;
          if (_unitRarity(unit) !== 'ordinary') continue;
          mortals.push(unit);
        }
      }
      if (mortals.length === 0) { pushLog(g, 'Knighthood — need an Ordinary Mortal in play.'); return; }
      const host = mortals[0];
      const hand: any[] = g.handSpells?.[pid] ?? [];
      const knightCards = hand
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => {
          if (!card || card.kind !== 'Unit') return false;
          if (_unitHasSubtype(card, 'Knight')) return true;
          const name = String(card.name ?? '').toLowerCase();
          if (name.startsWith('sir ') || name.startsWith('dame ')) return true;
          return _unitHasSubtype(card, 'Dame');
        });
      if (knightCards.length === 0) { pushLog(g, 'Knighthood finds no Knight/Sir/Dame in hand.'); return; }
      let choice = knightCards[0];
      if (knightCards.length > 1 && typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const menu = knightCards.map((entry, i) => `${i + 1}) ${entry.card.name}`).join('\n');
        const ans = window.prompt(`Knighthood — choose a Knight/Sir/Dame to summon at ${host.name}:\n${menu}`, '1');
        const idx = ans ? parseInt(ans, 10) : 1;
        if (Number.isFinite(idx) && idx > 0 && idx <= knightCards.length) choice = knightCards[idx - 1];
      }
      const [card] = hand.splice(choice.index, 1);
      const token = _tokenFromCard(card, pid, (host as any).x, (host as any).y, (host as any).region ?? 'surface');
      const cell = cellOfBoard(g, token.x, token.y);
      (cell.units ??= []).push(token);
      pushLog(g, `Knighthood calls ${token.name} to (${token.x + 1}, ${token.y + 1}).`);
    },
  },

  // Lava Flow — Fire line damaging other units on land sites
  {
    code: 'LAVA_FLOW',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Lava Flow fizzles — no caster found.'); return; }
      const dir = _chooseCardinalDirection('Lava Flow — choose a direction (N,S,E,W):');
      if (!dir) { pushLog(g, 'Lava Flow cancelled.'); return; }
      const deltas: Record<'N' | 'S' | 'E' | 'W', [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
      const [dx, dy] = deltas[dir];
      let x = (caster as any).x;
      let y = (caster as any).y;
      let hits = 0;
      while (insideBoard(g, x + dx, y + dy)) {
        x += dx; y += dy;
        const cell = cellOfBoard(g, x, y);
        if (!cell?.site || cell.site.rubble) break;
        const units = unitsAtTileInRegion(g, x, y, 'surface').filter((u: any) => u.id !== (caster as any).id);
        for (const u of units) { damage(g, u, 3, { sourceElement: 'Fire' }); hits++; }
      }
      if (hits === 0) pushLog(g, 'Lava Flow sputters across empty ground.');
      else pushLog(g, `Lava Flow burns ${hits} unit(s) along its path.`);
    },
  },

  // Shapeshift — reveal top 5 spells, pick a minion to become
  {
    code: 'SHAPESHIFT',
    targeting: 'click-unit',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const region = g.viewRegion ?? 'surface';
      const target = unitsAtTileInRegion(g, params.x, params.y, region)
        .find((u: any) => u.player === pid && u.kind !== 'Avatar');
      if (!target) { pushLog(g, 'Shapeshift: target an allied minion.'); return; }
      const deck: any[] = g.decks?.[pid]?.spellbook ?? [];
      if (deck.length === 0) { pushLog(g, 'Shapeshift finds no spells to look at.'); return; }
      const top = deck.splice(0, Math.min(5, deck.length));
      const minions = top.filter((c) => c && c.kind === 'Unit');
      let choice: any | null = minions[0] ?? null;
      if (minions.length > 1 && typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const menu = minions.map((c, i) => `${i + 1}) ${c.name}`).join('\n');
        const ans = window.prompt(`Shapeshift — choose a new form:\n${menu}\n0 = cancel`, '1');
        const idx = ans ? parseInt(ans, 10) : 0;
        if (!Number.isFinite(idx) || idx <= 0 || idx > minions.length) choice = null;
        else choice = minions[idx - 1];
      }
      const rest = top.filter((c) => c !== choice);
      _shuffleInPlace(rest, 'Shapeshift');
      deck.push(...rest);
      if (!choice) { pushLog(g, 'Shapeshift finds no suitable form.'); return; }
      _forceDropArtifacts(g, target);
      target.name = choice.name;
      target.power = choice.power ?? choice.atk ?? choice.def ?? 0;
      target.atk = choice.atk;
      target.def = choice.def;
      target.airborne = choice.airborne;
      target.burrowing = choice.burrowing;
      target.submerge = choice.submerge;
      target.voidwalk = choice.voidwalk;
      target.movementPlus = choice.movementPlus;
      target.ranged = choice.ranged;
      target.stealth = choice.stealth;
      target.lethal = choice.lethal;
      target.spellcaster = (choice as any).spellcaster;
      target.subTypes = (choice as any).subTypes ? [...(choice as any).subTypes] : undefined;
      target.size2x2 = (choice as any).size2x2 ? true : undefined;
      target.damage = 0;
      target.summonedThisTurn = true;
      (target as any)._srcCard = choice;
      const h = getSpellHostHelpers() as any;
      if (h?.refreshUnitArtifactPassives) {
        try { h.refreshUnitArtifactPassives(g, target); } catch { /* ignore */ }
      }
      pushLog(g, `${choice.name} form overwhelms ${choice.name === target.name ? 'the minion' : target.name}.`);
    },
  },

  // Snowball — piercing projectile that gathers units, then bursts
  {
    code: 'SNOWBALL',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Snowball fizzles — no caster found.'); return; }
      const dir = _chooseCardinalDirection('Snowball — choose a direction (N,S,E,W):');
      if (!dir) { pushLog(g, 'Snowball cancelled.'); return; }
      const deltas: Record<'N' | 'S' | 'E' | 'W', [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
      let x = (caster as any).x;
      let y = (caster as any).y;
      const region = (caster as any).region ?? g.viewRegion ?? 'surface';
      const carried: any[] = [];
      while (insideBoard(g, x + deltas[dir][0], y + deltas[dir][1])) {
        x += deltas[dir][0];
        y += deltas[dir][1];
        const units = unitsAtTileInRegion(g, x, y, region).filter((u: any) => u.id !== (caster as any).id);
        for (const u of units) {
          carried.push(u);
        }
      }
      if (carried.length === 0) { pushLog(g, `Snowball rolls ${dir} but picks up nothing.`); return; }
      for (const u of carried) {
        _moveUnitTo(g, u, x, y, region);
      }
      const payload = carried.length;
      const victims = unitsAtTileInRegion(g, x, y, region);
      for (const u of victims) damage(g, u, payload, { sourceElement: 'Water' });
      pushLog(g, `Snowball crashes with ${payload} unit(s), dealing ${payload} to ${victims.length} unit(s) at the end.`);
    },
  },

  // Stone Rain — click site within 2; 1 damage per site in hand
  {
    code: 'STONE_RAIN',
    targeting: 'click-tile',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Stone Rain fizzles — no caster found.'); return; }
      const dist = _chebyshev((caster as any).x ?? 0, (caster as any).y ?? 0, params.x, params.y);
      if (dist > 2) { pushLog(g, 'Stone Rain must target within two steps.'); return; }
      const cell = cellOfBoard(g, params.x, params.y);
      if (!cell?.site || cell.site.rubble) { pushLog(g, 'Stone Rain targets a site.'); return; }
      const siteCount =
        (g.handAtlas?.[pid]?.length ?? 0) +
        ((g.handSpells?.[pid] ?? []).filter((c: any) => c?.kind === 'Site').length);
      if (siteCount <= 0) { pushLog(g, 'Stone Rain — no site cards in hand, no stones fall.'); return; }
      const units = unitsAtTileInRegion(g, params.x, params.y, 'surface');
      for (const u of units) {
        for (let i = 0; i < siteCount; i++) damage(g, u, 1, { sourceElement: 'Earth' });
      }
      pushLog(g, `Stone Rain pelts ${units.length} unit(s) for ${siteCount} damage each.`);
    },
  },

  // Tactical Move — allies gain +2 movement this turn
  {
    code: 'TACTICAL_MOVE',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      let buffed = 0;
      for (const row of g.board ?? []) for (const cell of row ?? []) {
        for (const unit of cell?.units ?? []) {
          if (unit?.player !== pid) continue;
          if (unit.kind === 'Avatar') continue;
          const prev = unit.movementPlus ?? 0;
          const bonus = 2;
          unit.movementPlus = prev + bonus;
          (unit as any)._madDashBonus = ((unit as any)._madDashBonus ?? 0) + bonus;
          (unit as any)._madDashTurn = g.turn ?? pid;
          buffed++;
        }
      }
      pushLog(g, buffed > 0 ? `Tactical Move readies ${buffed} ally/allies with +2 movement this turn.` : 'Tactical Move has no allies to move.');
    },
  },

  // Valor — click defending ally for +4 power this turn
  {
    code: 'VALOR',
    targeting: 'click-unit',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const region = g.viewRegion ?? 'surface';
      const target = unitsAtTileInRegion(g, params.x, params.y, region)
        .find((u: any) => u.player === pid);
      if (!target) { pushLog(g, 'Valor: click an allied unit.'); return; }
      const cur = (target as any)._tempPowerBonus ?? 0;
      (target as any)._tempPowerBonus = cur + 4;
      pushLog(g, `${target.name} steels themselves with Valor (+4 power this turn).`);
    },
  },

  // Whirlwind — rotate units/artifacts in 2×2 area
  {
    code: 'WHIRLWIND',
    targeting: 'click-tile',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const dir = ((): 'CW' | 'CCW' | null => {
        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
          const ans = window.prompt('Whirlwind — direction? (CW/CCW)', 'CW');
          if (!ans) return null;
          const v = ans.trim().toUpperCase();
          if (v === 'CW' || v === 'CCW') return v;
          return null;
        }
        return 'CW';
      })();
      if (!dir) { pushLog(g, 'Whirlwind cancelled.'); return; }
      const x = params.x;
      const y = params.y;
      if (!insideBoard(g, x + 1, y) || !insideBoard(g, x, y + 1) || !insideBoard(g, x + 1, y + 1)) {
        pushLog(g, 'Whirlwind needs a full 2×2 area.'); return;
      }
      const cells = [
        { x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 },
      ];
      const rotate = dir === 'CW'
        ? [1, 2, 3, 0]
        : [3, 0, 1, 2];
      const region = 'surface';

      // Units
      const unitsByCell = cells.map((c) => unitsAtTileInRegion(g, c.x, c.y, region));
      cells.forEach((from, idx) => {
        const dest = cells[rotate[idx]];
        for (const u of unitsByCell[idx]) {
          _moveUnitTo(g, u, dest.x, dest.y, region);
        }
      });

      // Artifacts on ground
      const artifactsByCell = cells.map((c) => {
        const cell = cellOfBoard(g, c.x, c.y);
        return (cell?.artifacts ?? []).filter((a: any) => a.carriedBy == null && a.region === region);
      });
      cells.forEach((from, idx) => {
        const dest = cells[rotate[idx]];
        const destCell = cellOfBoard(g, dest.x, dest.y);
        const srcCell = cellOfBoard(g, from.x, from.y);
        if (!destCell || !srcCell) return;
        for (const art of artifactsByCell[idx]) {
          art.x = dest.x; art.y = dest.y; art.region = region;
          if (!destCell.artifacts?.some((a: any) => a.id === art.id)) {
            destCell.artifacts ??= [];
            destCell.artifacts.push(art);
          }
        }
        if (srcCell.artifacts) {
          srcCell.artifacts = srcCell.artifacts.filter(
            (a: any) => !artifactsByCell[idx].some((b: any) => b.id === a.id)
          );
        }
      });

      pushLog(g, `Whirlwind spins the 2×2 area ${dir === 'CW' ? 'clockwise' : 'counterclockwise'}.`);
    },
  },



  // Waypoint Portal — click a site; links avatar site ↔ clicked site this turn (engine can treat as adjacent later)
  {
  code: 'WAYPOINT_PORTAL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    const cell = g.board?.[params.y]?.[params.x];
    if (!cell?.site) { g.log.unshift('Waypoint Portal: choose a site.'); return; }

    // First click: remember site A
    if (!g._pendingWaypointPortal || g._pendingWaypointPortal.pid !== pid) {
      g._pendingWaypointPortal = { pid, a: { x: params.x, y: params.y } };
      g.log.unshift(`Waypoint Portal: site A selected at (${params.x + 1}, ${params.y + 1}). Click a second site to link.`);
      return;
    }

    // Second click: site B, finish
    const a = g._pendingWaypointPortal.a;
    const b = { x: params.x, y: params.y };
    if (a.x === b.x && a.y === b.y) { g.log.unshift('Waypoint Portal: pick a different site for site B.'); return; }
    if (!g.board?.[b.y]?.[b.x]?.site) { g.log.unshift('Waypoint Portal: site B must be a site.'); return; }

    g._waypointPortals ??= [];
    g._waypointPortals.push({ a, b, expiresTurn: g.turn });
    delete g._pendingWaypointPortal;

    g.log.unshift(`Waypoint Portal links (${a.x + 1},${a.y + 1}) ↔ (${b.x + 1},${b.y + 1}) for this turn.`);
  },
},

  // Cloud Spirit — Minion (Air) — Airborne, Movement +2
  {
    code: 'CLOUD_SPIRIT',
    targeting: 'none',
    resolve(ctx) {
      const g: any = ctx.state;
    const pid: any = ctx.pid;
      const av = g.avatars?.[pid]; if (!av) return;
      const cell = g.board[av.y][av.x];
      const token = {
        id: Math.random().toString(36).slice(2, 9),
        kind: 'Token' as const, name: 'Cloud Spirit', element: 'Air',
        player: pid, x: av.x, y: av.y, region: 'surface', tapped: false,
        power: 2, atk: 2, def: 2, airborne: true, movementPlus: 2,
        carrying: [] as string[], summonedThisTurn: true,
      };
      cell.units.push(token);
      g.log.unshift(`Cloud Spirit materializes at (${av.x + 1}, ${av.y + 1}).`);
    },
  },

  {
  code: 'DISPEL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    // Dispel centers on the clicked tile; we ignore caster range. 
    // Region: artifacts respect the current view; auras live on surface.
    const tx = params.x;
    const ty = params.y;
    const region = g.viewRegion as 'surface' | 'underground' | 'underwater' | 'void';

    // Build the 2-step (Chebyshev ≤ 2) neighborhood around (tx,ty)
    const inRange = new Set<string>();
    const key = (x:number,y:number) => `${x},${y}`;
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) {
        if (x < 0 || y < 0 || y >= g.height || x >= g.width) continue;
        // Chebyshev distance
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 2) inRange.add(key(x,y));
      }
    }
  
    

    // ---- AURAS (surface only): destroy any aura that covers ANY tile in the 2-step neighborhood
    const destroyedAuras: any[] = [];
    for (let i = g.auras.length - 1; i >= 0; i--) {
      const a = g.auras[i];
      if (a.shape !== '2x2') continue;                    // your engine’s auras are 2×2
      if (region !== 'surface') continue;                 // auras exist on surface only
      const ax = a.anchor.x, ay = a.anchor.y;
      const tiles = [
        key(ax,     ay),
        key(ax + 1, ay),
        key(ax,     ay + 1),
        key(ax + 1, ay + 1),
      ];
      if (tiles.some(tk => inRange.has(tk))) {
        destroyedAuras.push(a);
        g.auras.splice(i, 1);
        releaseAuraSourceCard(g, a);
      }
    }

    // ---- ARTIFACTS: destroy any artifact at any tile in the 2-step neighborhood in the current view region
    // Includes *carried* artifacts (their x,y,region track their carrier).
    const destroyedArtifacts: any[] = [];
    const toDestroy = g.artifacts.filter((art: any) => inRange.has(key(art.x, art.y)) && art.region === region);
    for (const art of toDestroy) {
      // Remove from any carrier
      if (art.carriedBy) {
        const carrier = g.board.flat().flatMap((c: any) => c.units).find((u: any) => u.id === art.carriedBy);
        if (carrier && Array.isArray((carrier as any).carrying)) {
          (carrier as any).carrying = (carrier as any).carrying.filter((id: string) => id !== art.id);
        }
      }
      // Remove from surface list if present
      const cell = g.board[art.y]?.[art.x];
      if (cell && Array.isArray(cell.artifacts)) {
        cell.artifacts = cell.artifacts.filter((s: any) => s.id !== art.id);
      }
      // Remove from global artifacts
      const idx = g.artifacts.findIndex((z: any) => z.id === art.id);
      if (idx >= 0) {
        destroyedArtifacts.push(art);
        g.artifacts.splice(idx, 1);
      }
    }

    const nA = destroyedAuras.length;
    const nR = destroyedArtifacts.length;
    if (nA === 0 && nR === 0) {
      g.log.unshift(`Dispel at (${tx + 1}, ${ty + 1}) found no auras or artifacts within two steps.`);
      return;
    }
    if (nA > 0) g.log.unshift(`Dispel destroys ${nA} aura(s) within two steps of (${tx + 1}, ${ty + 1}).`);
    if (nR > 0) g.log.unshift(`Dispel destroys ${nR} artifact(s) within two steps of (${tx + 1}, ${ty + 1}).`);
  },
},

  {
  code: 'OVERPOWER',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    // Units at the clicked tile in the current viewRegion (allow Avatar or Token)
    const region = g.viewRegion;
    const list = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region) || [];
    if (!list.length) { g.log.unshift('Overpower: no unit here.'); return; }

    // Target must be friendly ("ally")
    const target = list.find((u: any) => u.player === pid);
    if (!target) { g.log.unshift('Overpower: target must be a friendly unit.'); return; }

    // Apply a temporary power bonus for this turn only
    target._tempPowerBonus = (target._tempPowerBonus ?? 0) + 2;
    g.log.unshift(`Overpower: ${target.name} gets +2 power this turn.`);
  },
},

{
  code: 'CRITICAL_STRIKE',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    // Current view region is used to disambiguate units at (x,y)
    const region = g.viewRegion;
    const list = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region && u.player === pid) || [];
    if (!list.length) { g.log.unshift('Critical Strike: target a friendly unit.'); return; }

    // Choose the first friendly unit on that tile (Avatar or Token are both valid)
    const target = list[0];

    // Set a one-shot "double next strike" flag for this turn
    target._tempCritPending = true;
    g.log.unshift(`Critical Strike: ${target.name} will deal double damage on its next strike this turn.`);
  },
},

{
  code: 'WHIRLING_BLADES',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    // Units on the clicked tile in the current view region
    const region = g.viewRegion;
    const tileUnits: any[] = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region) || [];
    if (!tileUnits.length) { g.log.unshift('Whirling Blades: no unit here.'); return; }

    // Target must be an ally
    const self = tileUnits.find((u: any) => u.player === pid);
    if (!self) { g.log.unshift('Whirling Blades: target a friendly unit.'); return; }

    // Arm a pending 2-step path sequence resolved in App.tsx
    (g as any)._pendingWhirling = {
      pid,
      unitId: self.id,
      stepsLeft: 2,
    };
    g.log.unshift(`Whirling Blades: choose up to two legal steps for ${self.name}. Each destination strikes enemies on that tile.`);
  },
},

{
  code: 'SLEEP',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;

    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Sleep fizzles — no caster found.'); return; }

    const region = g.viewRegion ?? (caster.region ?? 'surface');
    const tileUnits: any[] =
      g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region && u.kind !== 'Avatar') || [];
    if (tileUnits.length === 0) { pushLog(g, 'Sleep: target a minion.'); return; }

    let target = tileUnits[0];
    if (tileUnits.length > 1) {
      const menu = tileUnits.map((u, i) => `${i + 1}) ${u.name} (P${u.player})`).join('\n');
      const ans = window.prompt(`Sleep — choose a minion:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > tileUnits.length) {
        pushLog(g, 'Sleep cancelled.');
        return;
      }
      target = tileUnits[idx - 1];
    }

    const dist = _chebyshev(caster.x ?? caster.location?.x ?? 0, caster.y ?? caster.location?.y ?? 0, target.x, target.y);
    if (dist > 2) { pushLog(g, 'Sleep: target must be within two steps of the caster.'); return; }

    target.tapped = true;
    if (target.kind !== 'Avatar') target.interactedThisTurn = true;
    (target as any).skipUntapOnce = true;
    (target as any)._sleepSpell = true;
    pushLog(g, `${target.name} drifts into a magical slumber.`);
  },
},

{
  code: 'CONE_OF_FLAME',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Cone of Flame fizzles — no caster found.'); return; }

    const dirAns = window.prompt('Cone of Flame — choose a direction (N, S, E, W):', 'N');
    if (!dirAns) { pushLog(g, 'Cone of Flame dissipates without a direction.'); return; }
    const dir = dirAns.trim().toUpperCase();
    const deltas: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const delta = deltas[dir];
    if (!delta) { pushLog(g, 'Cone of Flame requires direction N, S, E, or W.'); return; }

    let x = (caster as any).x ?? caster.location?.x ?? 0;
    let y = (caster as any).y ?? caster.location?.y ?? 0;
    const region = (caster as any).region ?? caster.location?.region ?? (g.viewRegion ?? 'surface');
    const damages = [3, 2, 1];
    let hits = 0;

    for (const amount of damages) {
      x += delta[0];
      y += delta[1];
      if (!insideBoard(g, x, y)) break;
      const units = unitsAtTileInRegion(g, x, y, region);
      if (!Array.isArray(units) || units.length === 0) continue;
      for (const unit of units) {
        damage(g, unit, amount, { sourceElement: 'Fire' });
        hits += 1;
      }
    }

    if (hits === 0) pushLog(g, `Cone of Flame scorches empty ground to the ${dir}.`);
    else pushLog(g, `Cone of Flame sears ${hits} unit(s) toward the ${dir}.`);
  },
},

{
  code: 'FLAME_WAVE',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const row = params.y;
    if (typeof row !== 'number') { pushLog(g, 'Flame Wave needs a target row.'); return; }

    let hits = 0;
    for (let x = 0; x < g.width; x++) {
      if (!insideBoard(g, x, row)) continue;
      const cell = cellOfBoard(g, x, row);
      if (!cell?.site || cell.site.rubble) continue;
      const units = unitsAtTileInRegion(g, x, row, 'surface');
      if (!Array.isArray(units) || units.length === 0) continue;
      for (const unit of units) {
        damage(g, unit, 4, { sourceElement: 'Fire' });
        hits += 1;
      }
    }

    if (hits === 0) pushLog(g, `Flame Wave washes over vacant sites on row ${row + 1}.`);
    else pushLog(g, `Flame Wave engulfs ${hits} unit(s) along row ${row + 1}.`);
  },
},

{
  code: 'INFILTRATE',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion ?? 'surface';
    const list = unitsAtTileInRegion(g, params.x, params.y, region)
      .filter((u: any) => u.kind !== 'Avatar');
    if (!list.length) { pushLog(g, 'Infiltrate: target an enemy minion.'); return; }

    const target = list.find((u: any) => u.player !== pid);
    if (!target) { pushLog(g, 'Infiltrate: choose an enemy minion.'); return; }

    const original = target.player;
    const prevStealth = !!target.stealth;
    target.player = pid;
    if (!_canGainStealth(target)) {
      pushLog(g, `${target.name} cannot gain Stealth (suppressed).`);
    } else {
      target.stealth = true;
    }
    target.tapped = true;
    if (target.kind !== 'Avatar') target.interactedThisTurn = true;
    (target as any)._infiltrate = { originalPid: original, prevStealth };

    pushLog(g, `${target.name} is infiltrated and now fights for you until it no longer has Stealth.`);
  },
},

{
  code: 'DISENCHANT',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Disenchant fizzles — no caster found.'); return; }

    const region = g.viewRegion ?? caster.region ?? 'surface';
    const originX = caster.x ?? caster.location?.x ?? 0;
    const originY = caster.y ?? caster.location?.y ?? 0;
    const dx = params.x - originX;
    const dy = params.y - originY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 2) {
      pushLog(g, 'Disenchant must target a location within two steps of the caster.');
      return;
    }

    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell) { pushLog(g, 'Disenchant: invalid tile.'); return; }

    let auraCount = 0;
    if (Array.isArray(g.auras)) {
      for (let i = g.auras.length - 1; i >= 0; i--) {
        const aura = g.auras[i];
        if (!aura || aura.shape !== '2x2') continue;
        const ax = aura.anchor.x;
        const ay = aura.anchor.y;
        const coversTile = params.x >= ax && params.x <= ax + 1 && params.y >= ay && params.y <= ay + 1;
        if (coversTile) {
          auraCount++;
          g.auras.splice(i, 1);
          removeAuraFromBoard(g, aura.id);
          releaseAuraSourceCard(g, aura);
        }
      }
    }

    const destroyedArtifacts: any[] = [];
    if (Array.isArray(g.artifacts)) {
      const victims = g.artifacts.filter((art: any) => art.x === params.x && art.y === params.y && art.region === region);
      for (const art of victims) {
        if (art.carriedBy) {
          const carrier = g.board.flat().flatMap((c: any) => c.units || []).find((u: any) => u.id === art.carriedBy);
          if (carrier && Array.isArray(carrier.carrying)) {
            carrier.carrying = carrier.carrying.filter((id: string) => id !== art.id);
          }
        }
        const surface = cellOfBoard(g, art.x, art.y);
        if (surface && Array.isArray(surface.artifacts)) {
          surface.artifacts = surface.artifacts.filter((other: any) => other.id !== art.id);
        }
        const idx = g.artifacts.findIndex((other: any) => other.id === art.id);
        if (idx >= 0) {
          destroyedArtifacts.push(art);
          g.artifacts.splice(idx, 1);
        }
      }
    }

    if (!auraCount && destroyedArtifacts.length === 0) {
      pushLog(g, `Disenchant at (${params.x + 1}, ${params.y + 1}) finds nothing to destroy.`);
      return;
    }
    if (auraCount) pushLog(g, `Disenchant destroys ${auraCount} aura(s) at (${params.x + 1}, ${params.y + 1}).`);
    if (destroyedArtifacts.length) pushLog(g, `Disenchant shatters ${destroyedArtifacts.length} artifact(s) at (${params.x + 1}, ${params.y + 1}).`);
  },
},

{
  code: 'RAISE_DEAD',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const cemetery: any[] = g.cemetery?.[pid] ?? [];
    const corpses = cemetery.filter((c: any) => c && c.kind === 'Unit');
    if (corpses.length === 0) { pushLog(g, 'Raise Dead finds no minions in your cemetery.'); return; }

    const card = pickRandom(corpses)!;
    const idx = cemetery.findIndex((c: any) => c.id === card.id);
    if (idx >= 0) cemetery.splice(idx, 1);

    const av = g.avatars?.[pid];
    if (!av) { pushLog(g, 'Raise Dead fizzles — avatar not found.'); return; }

    const token: any = {
      id: _rngId(),
      kind: 'Token',
      name: card.name,
      element: card.element ?? 'Earth',
      player: pid,
      x: av.x,
      y: av.y,
      region: (av as any).region ?? 'surface',
      tapped: false,
      power: card.power ?? card.atk ?? card.def ?? 0,
      atk: card.atk,
      def: card.def,
      airborne: card.airborne,
      burrowing: card.burrowing,
      submerge: card.submerge,
      voidwalk: card.voidwalk,
      movementPlus: card.movementPlus,
      ranged: card.ranged,
      stealth: card.stealth,
      lethal: card.lethal,
      spellcaster: (card as any).spellcaster,
      provides: (card as any).provides ? [...(card as any).provides] : undefined,
      carrying: [],
      summonedThisTurn: true,
      damage: 0,
      image: card.image,
    };
    token._srcCard = card;

    const cell = cellOfBoard(g, av.x, av.y);
    (cell.units ??= []).push(token);
    pushLog(g, `Raise Dead summons ${token.name} beside your avatar.`);
  },
},

{
  code: 'TELEKINESIS',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Telekinesis fizzles — no caster found.'); return; }
    if (caster.kind === 'Avatar') { pushLog(g, 'Telekinesis requires a minion to carry the artifact.'); return; }

    const region = caster.region ?? 'surface';
    const dx = params.x - caster.x;
    const dy = params.y - caster.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) { pushLog(g, 'Telekinesis can only target artifacts adjacent to the caster.'); return; }

    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell) { pushLog(g, 'Telekinesis: invalid tile.'); return; }

    const candidates = (cell.artifacts ?? []).filter((a: any) => a.carriedBy == null && !a.isMonument && a.region === region);
    if (!candidates.length) { pushLog(g, 'Telekinesis finds no loose artifacts on that tile.'); return; }

    let artifact = candidates[0];
    if (candidates.length > 1) {
      const menu = candidates.map((a: any, i: number) => `${i + 1}) ${a.name}`).join('\n');
      const ans = window.prompt(`Telekinesis: choose an artifact to snatch:\n${menu}\n0 = cancel`, '1');
      const k = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(k) || k <= 0 || k > candidates.length) { pushLog(g, 'Telekinesis cancelled.'); return; }
      artifact = candidates[k - 1];
    }

    const token = caster as any;
    if (!Array.isArray(token.carrying)) token.carrying = [];
    token.carrying.push(artifact.id);
    artifact.carriedBy = caster.id;
    artifact.x = caster.x;
    artifact.y = caster.y;
    artifact.region = region;

    cell.artifacts = cell.artifacts.filter((a: any) => a.id !== artifact.id);
    pushLog(g, `${caster.name} snatches ${artifact.name} with Telekinesis.`);
  },
},

{
  code: 'FIREBOLTS',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Firebolts fizzles — no caster found.'); return false; }
    const helpers = getSpellHostHelpers();
    const emitProjectileFx = typeof helpers?.emitProjectileFx === 'function' ? helpers.emitProjectileFx : null;
    const shootCustomProjectile = typeof helpers?.shootCustomProjectile === 'function' ? helpers.shootCustomProjectile : null;
    const selectOne = typeof helpers?.selectOne === 'function' ? helpers.selectOne : null;
    const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;

    const directions = [
      { label: 'North', dir: 'N', delta: [0, -1] as [number, number] },
      { label: 'South', dir: 'S', delta: [0, 1] as [number, number] },
      { label: 'East', dir: 'E', delta: [1, 0] as [number, number] },
      { label: 'West', dir: 'W', delta: [-1, 0] as [number, number] },
    ];

    const runFirebolts = async (dirInfo: { dir: string; delta: [number, number] }) => {
      const region = caster.region ?? 'surface';
      if (shootCustomProjectile && Number.isFinite(caster.x) && Number.isFinite(caster.y)) {
        for (let shot = 1; shot <= 3; shot++) {
          await shootCustomProjectile(g, {
            from: {
              x: caster.x,
              y: caster.y,
              region,
            },
            dir: dirInfo.dir as 'N' | 'S' | 'E' | 'W',
            amount: 1,
            label: `Firebolts (${shot}/3)`,
            opts: {
              sourceUnit: caster,
              sourceElement: 'Fire',
              projectileStyle: 'fire',
            },
          });
        }
        if (requestSync) requestSync();
        return;
      }
      const ignoreStealth = ignoreStealthLocal(g, caster);
      const [dx, dy] = dirInfo.delta;

      for (let shot = 1; shot <= 3; shot++) {
        let x = caster.x;
        let y = caster.y;
        let hit = false;
        while (insideBoard(g, x + dx, y + dy)) {
          x += dx;
          y += dy;
          const targets = unitsAtTileInRegion(g, x, y, region).filter((u: any) => ignoreStealth || !(u as any).stealth);
          if (!targets.length) continue;

          let target = targets[0];
          if (targets.length > 1 && selectOne) {
            const picked = await selectOne({
              title: 'Firebolts',
              message: `Shot ${shot}/3 — choose a target.`,
              options: targets.map((u: any, i: number) => ({
                label: `${u.name} (P${u.player})`,
                value: i,
              })),
              allowCancel: true,
              cancelLabel: 'Default Target',
            });
            if (picked != null && picked >= 0 && picked < targets.length) {
              target = targets[picked];
            }
          }

          const amount = lethalAmountLocal(g, caster, target, 1);
          if (emitProjectileFx) {
            emitProjectileFx(g, {
              fromX: caster.x,
              fromY: caster.y,
              toX: x,
              toY: y,
              style: 'fire',
              hit: true,
              pid,
              cardName: 'Firebolts',
              source: 'spell',
            });
          }
          damage(g, target, amount, { sourceElement: 'Fire' });
          pushLog(g, `Firebolts (${shot}/3) hits ${target.name} for ${amount >= 999 ? 'lethal' : '1'}.`);
          hit = true;
          break;
        }
        if (!hit) {
          if (emitProjectileFx) {
            emitProjectileFx(g, {
              fromX: caster.x,
              fromY: caster.y,
              toX: x,
              toY: y,
              style: 'fire',
              hit: false,
              pid,
              cardName: 'Firebolts',
              source: 'spell',
            });
          }
          pushLog(g, `Firebolts (${shot}/3) flies harmlessly away.`);
        }
      }
      if (requestSync) requestSync();
    };

    const pendingDir = (g as any)._pendingFireboltsDir as 'N' | 'S' | 'E' | 'W' | undefined;
    if (pendingDir) {
      delete (g as any)._pendingFireboltsDir;
      const dirInfo = directions.find(entry => entry.dir === pendingDir);
      if (dirInfo) {
        void (async () => {
          try {
            await runFirebolts(dirInfo);
          } catch (err) {
            pushLog(g, 'Firebolts fizzles unexpectedly.');
            if (requestSync) requestSync();
            // eslint-disable-next-line no-console
            console.error('Firebolts resolve failed:', err);
          }
        })();
        return;
      }
    }

    const dirRaw = window.prompt('Firebolts direction (N, S, E, W)?', 'N');
    if (!dirRaw) { pushLog(g, 'Firebolts cancelled.'); if (requestSync) requestSync(); return; }
    const dir = dirRaw.trim().toUpperCase();
    if (!['N', 'S', 'E', 'W'].includes(dir)) { pushLog(g, 'Firebolts: invalid direction.'); if (requestSync) requestSync(); return; }
    const delta = dir === 'N' ? [0, -1] : dir === 'S' ? [0, 1] : dir === 'E' ? [1, 0] : [-1, 0];
    void (async () => {
      try {
        await runFirebolts({ dir, delta: delta as [number, number] });
      } catch (err) {
        pushLog(g, 'Firebolts fizzles unexpectedly.');
        if (requestSync) requestSync();
        // eslint-disable-next-line no-console
        console.error('Firebolts resolve failed:', err);
      }
    })();
  },
},

{
  code: 'BLAZE',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const unit = unitsAtTileInRegion(g, params.x, params.y, region).find(
      (u: any) => u.player === pid && u.kind !== 'Avatar'
    );
    if (!unit) { pushLog(g, 'Blaze: target a friendly minion.'); return; }
    unit.movementPlus = (unit.movementPlus ?? 0) + 2;
    (unit as any)._madDashBonus = ((unit as any)._madDashBonus ?? 0) + 2;
    (unit as any)._madDashTurn = g.turn;
    (unit as any)._blazeActive = { pid, turn: g.turn, damage: 2 };
    pushLog(g, `${unit.name} ignites with Blaze — +2 movement, cannot be intercepted, and scorches its path.`);
  },
},

{
  code: 'CHARGE',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const list = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region && u.player === pid) || [];
    if (!list.length) { pushLog(g, 'Charge: target a friendly unit.'); return; }
    const target = list[0];
    if (target.kind === 'Avatar') { pushLog(g, 'Charge has no effect on your avatar.'); return; }

    target.summonedThisTurn = false;
    target._chargeGrantedTurn = g.turn;
    pushLog(g, `${target.name} gains Charge this turn.`);
  },
},

{
  code: 'DIVINE_HEALING',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const av = g.avatars?.[pid];
    if (!av) { pushLog(g, 'Divine Healing fizzles — avatar not found.'); return; }
    if (av.deathsDoor) { pushLog(g, 'Divine Healing has no effect — your avatar is at Death\'s Door.'); return; }
    const healed = _healAvatarLifeLocal(g, pid, 7);
    pushLog(g, `Divine Healing restores ${healed} life to ${av.name}.`);
  },
},

{
  code: 'SCORCHED_EARTH',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const width = g.width ?? 0;
    const height = g.height ?? 0;
    const candidates: Array<{ x: number; y: number; name: string }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = cellOfBoard(g, x, y);
        const site = cell?.site;
        if (!site || site.rubble) continue;
        if (site.controller !== pid) continue;
        candidates.push({ x, y, name: site.name ?? 'Site' });
      }
    }

    if (candidates.length === 0) {
      pushLog(g, 'Scorched Earth: you control no standing sites.');
      return;
    }

    let selected = candidates;
    const canPrompt =
      typeof window !== 'undefined' &&
      window != null &&
      typeof window.prompt === 'function';

    if (canPrompt) {
      const menu = candidates
        .map((entry, i) => `${i + 1}) ${entry.name} @ (${entry.x + 1}, ${entry.y + 1})`)
        .join('\n');
      const raw = window.prompt(
        `Scorched Earth — choose sites to destroy (comma separated).\n${menu}\nBlank = all, 0 = cancel`,
        ''
      );
      if (raw === null) {
        pushLog(g, 'Scorched Earth cancelled.');
        return;
      }
      const trimmed = raw.trim();
      if (trimmed === '0') {
        pushLog(g, 'Scorched Earth cancelled.');
        return;
      }
      if (trimmed.length > 0) {
        const picks = trimmed
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => Number.isFinite(n));
        const chosen: Array<{ x: number; y: number; name: string }> = [];
        for (const index of picks) {
          if (index <= 0 || index > candidates.length) continue;
          const entry = candidates[index - 1];
          if (!chosen.includes(entry)) chosen.push(entry);
        }
        if (chosen.length === 0) {
          pushLog(g, 'Scorched Earth: no valid sites selected.');
          return;
        }
        selected = chosen;
      }
    }

    let razed = 0;
    for (const entry of selected) {
      const name = _scorchedEarthRazeSite(g, pid, entry.x, entry.y);
      if (!name) continue;
      razed += 1;
      pushLog(g, `Scorched Earth razes ${name} at (${entry.x + 1}, ${entry.y + 1}).`);
    }

    if (razed === 0) {
      pushLog(g, 'Scorched Earth finds no eligible sites to destroy.');
    }
  },
},

{
  code: 'SPIN_ATTACK',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const units = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region) || [];
    if (!units.length) { pushLog(g, 'Spin Attack: no units here.'); return; }
    const ally = units.find((u: any) => u.player === pid);
    if (!ally) { pushLog(g, 'Spin Attack: target a friendly unit.'); return; }
    const enemies = units.filter((u: any) => u.player !== pid);
    if (!enemies.length) { pushLog(g, 'Spin Attack: no enemies to strike.'); return; }

    const dmg = ally.atk ?? ally.power ?? 0;
    if (dmg <= 0) { pushLog(g, `${ally.name} lacks the power to spin attack.`); return; }

    for (const foe of enemies) {
      const amount = lethalAmountLocal(g, ally, foe, dmg);
      damage(g, foe, amount);
      pushLog(g, `Spin Attack: ${ally.name} hits ${foe.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
    }
  },
},

{
  code: 'GRAPPLE_SHOT',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const list = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region && u.player === pid) || [];
    if (!list.length) { pushLog(g, 'Grapple Shot: target a friendly unit.'); return; }
    const ally = list[0];
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Grapple Shot fizzles — no caster found.'); return; }
    const dirRaw = window.prompt('Grapple Shot direction (N, S, E, W)?', 'N');
    if (!dirRaw) { pushLog(g, 'Grapple Shot cancelled.'); return; }
    const dir = dirRaw.trim().toUpperCase();
    if (!['N', 'S', 'E', 'W'].includes(dir)) { pushLog(g, 'Grapple Shot: invalid direction.'); return; }

    const delta = dir === 'N' ? [0, -1] : dir === 'S' ? [0, 1] : dir === 'E' ? [1, 0] : [-1, 0];

    let x = ally.x;
    let y = ally.y;
    let struck: any = null;
    while (insideBoard(g, x + delta[0], y + delta[1])) {
      x += delta[0];
      y += delta[1];
      const foes = unitsAtTileInRegion(g, x, y, region).filter((u: any) => u.player !== pid);
      if (!foes.length) continue;
      struck = foes[0];
      pushLog(g, `Grapple Shot latches onto ${struck.name}.`);
      break;
    }

    if (!struck) {
      pushLog(g, 'Grapple Shot misses and the rope retracts.');
      return;
    }

    _moveUnitTo(g, caster, struck.x, struck.y, struck.region);
    pushLog(g, `${caster.name} is yanked to (${struck.x + 1}, ${struck.y + 1}).`);
    _moveUnitTo(g, ally, struck.x, struck.y, struck.region);
    pushLog(g, `${ally.name} is dragged to (${struck.x + 1}, ${struck.y + 1}).`);

    const cell = cellOfBoard(g, struck.x, struck.y);
    const stillThere = cell.units?.find((u: any) => u.id === struck.id);
    if (stillThere) {
      const casterSwing = lethalAmountLocal(g, caster, stillThere, caster.atk ?? caster.power ?? 0);
      damage(g, stillThere, casterSwing);
      pushLog(g, `${caster.name} strikes ${stillThere.name} for ${casterSwing >= 999 ? 'lethal damage' : casterSwing}.`);
      const promptText = `Grapple Shot: Should ${ally.name} strike ${stillThere.name}?`;
      const shouldStrike = typeof window !== 'undefined' ? window.confirm(promptText) : false;
      if (!shouldStrike) {
        pushLog(g, `${ally.name} holds position without striking ${stillThere.name}.`);
        return;
      }
      const swing = lethalAmountLocal(g, ally, stillThere, ally.atk ?? ally.power ?? 0);
      damage(g, stillThere, swing);
      pushLog(g, `${ally.name} strikes ${stillThere.name} for ${swing >= 999 ? 'lethal damage' : swing}.`);
      return;
    }
    pushLog(g, `${ally.name} arrives but the foe slips free.`);
  },
},

{
  code: 'PLAGUE_OF_FROGS',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Plague of Frogs fizzles — no caster found.'); return; }
    const queue: Array<{ x: number; y: number }> = [{ x: caster.x, y: caster.y }];
    const seen = new Set<string>();
    const positions: Array<{ x: number; y: number }> = [];
    const key = (qx: number, qy: number) => `${qx},${qy}`;
    while (queue.length && positions.length < 7) {
      const cur = queue.shift()!;
      if (seen.has(key(cur.x, cur.y))) continue;
      seen.add(key(cur.x, cur.y));
      if (!insideBoard(g, cur.x, cur.y)) continue;
      const cell = cellOfBoard(g, cur.x, cur.y);
      if (cell.site) positions.push(cur);
      for (const [dx, dy] of neighbors8(g, cur.x, cur.y)) {
        queue.push({ x: dx, y: dy });
      }
    }

    if (positions.length === 0) { pushLog(g, 'Plague of Frogs finds nowhere to spawn.'); return; }

    let count = 0;
    for (const pos of positions.slice(0, 7)) {
      const cell = cellOfBoard(g, pos.x, pos.y);
      const frog = {
        id: _rngId(),
        kind: 'Token' as const,
        name: 'Frog',
        element: 'Water',
        player: pid,
        x: pos.x,
        y: pos.y,
        region: 'surface' as const,
        tapped: false,
        power: 1,
        atk: 1,
        def: 1,
        carrying: [] as string[],
        summonedThisTurn: true,
        damage: 0,
        image: '/assets/Frog.png',
      };
      (cell.units ??= []).push(frog);
      count++;
    }
    pushLog(g, `Plague of Frogs summons ${count} frog token(s).`);
  },
},

{
  code: 'GIGANTISM',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const list = g.board?.[params.y]?.[params.x]?.units?.filter((u: any) => u.region === region && u.player === pid) || [];
    if (!list.length) { pushLog(g, 'Gigantism: target a friendly unit.'); return; }
    const target = list[0];
    (target as any)._tempPowerBonus = ((target as any)._tempPowerBonus ?? 0) + 6;
    pushLog(g, `Gigantism grants ${target.name} +6 power this turn.`);
  },
},

{
  code: 'FADE',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const units = cell?.units?.filter((u: any) => u.region === region) || [];
    const ally = units.find((u: any) => u.player === pid && u.kind !== 'Avatar');
    if (!ally) { pushLog(g, 'Fade: target a friendly minion.'); return; }
    const granted = _canGainStealth(ally);
    if (granted) {
      ally.stealth = true;
      pushLog(g, `${ally.name} fades into the shadows.`);
    } else {
      pushLog(g, `${ally.name} cannot gain Stealth (suppressed).`);
    }
    const site = cell?.site;
    if (site && site.controller != null && site.controller !== pid) {
      const drawn = _drawFromSpellbook(g, pid, 1);
      if (drawn > 0) pushLog(g, 'Fade — drew 1 card for occupying an enemy site.');
      else pushLog(g, 'Fade — no cards left to draw.');
    }
  },
},

{
  code: 'FLANKING_MANEUVER',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const allies: any[] = (cell?.units || []).filter((u: any) => u.player === pid && u.region === region);
    if (!allies.length) { pushLog(g, 'Flanking Maneuver: no allies at the chosen location.'); return; }
    const deltas: Array<[number, number]> = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    const candidates: Array<{ x: number; y: number }> = [];
    for (const [dx, dy] of deltas) {
      const nx = params.x + dx;
      const ny = params.y + dy;
      if (!insideBoard(g, nx, ny)) continue;
      const destCell = cellOfBoard(g, nx, ny);
      if (allies.every((u) => _regionAllowedForUnitAtCell(u, u.region, destCell))) {
        candidates.push({ x: nx, y: ny });
      }
    }
    if (!candidates.length) { pushLog(g, 'Flanking Maneuver: no legal knight-move destinations.'); return; }
    const helpers: any = getSpellHostHelpers();
    const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;

    const moveAlliesTo = (dest: { x: number; y: number }) => {
      const destCell = cellOfBoard(g, dest.x, dest.y);
      const stillAllies = allies.filter((u) =>
        u.player === pid && u.region === region && u.x === params.x && u.y === params.y
      );
      if (!stillAllies.length) {
        pushLog(g, 'Flanking Maneuver fizzles — allied units have moved.');
        if (requestSync) requestSync();
        return;
      }
      if (!stillAllies.every((u) => _regionAllowedForUnitAtCell(u, u.region, destCell))) {
        pushLog(g, 'Flanking Maneuver: destination is no longer legal.');
        if (requestSync) requestSync();
        return;
      }
      for (const unit of stillAllies) {
        _moveUnitTo(g, unit, dest.x, dest.y, unit.region);
      }
      pushLog(g, `Flanking Maneuver repositions ${stillAllies.length} ally(s) to (${dest.x + 1}, ${dest.y + 1}).`);
      const drawn = _drawFromSpellbook(g, pid, 1);
      if (drawn > 0) pushLog(g, 'Flanking Maneuver — drew 1 card.');
      else pushLog(g, 'Flanking Maneuver — no cards left to draw.');
      if (requestSync) requestSync();
    };

    if (candidates.length === 1) {
      moveAlliesTo(candidates[0]);
      return;
    }

    const selectOne = typeof helpers?.selectOne === 'function' ? helpers.selectOne : null;
    if (selectOne) {
      void (async () => {
        const choice = await selectOne({
          title: 'Flanking Maneuver',
          message: 'Choose a destination to reposition your allies.',
          options: candidates.map((p, i) => ({
            label: `(${p.x + 1}, ${p.y + 1})`,
            value: i,
          })),
          allowCancel: true,
          cancelLabel: 'Cancel',
        });
        if (choice == null) {
          pushLog(g, 'Flanking Maneuver cancelled.');
          if (requestSync) requestSync();
          return;
        }
        const dest = candidates[choice];
        if (!dest) {
          pushLog(g, 'Flanking Maneuver cancelled.');
          if (requestSync) requestSync();
          return;
        }
        moveAlliesTo(dest);
      })();
      return;
    }

    const menu = candidates.map((p, i) => `${i + 1}) (${p.x + 1},${p.y + 1})`).join('\n');
    const ans = window.prompt(`Flanking Maneuver — choose destination:\n${menu}\n0 = cancel`, '1');
    const idx = ans ? parseInt(ans, 10) : 0;
    if (!Number.isFinite(idx) || idx <= 0 || idx > candidates.length) { pushLog(g, 'Flanking Maneuver cancelled.'); return; }
    const dest = candidates[idx - 1];
    moveAlliesTo(dest);
  },
},

{
  code: 'MORTALITY',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Mortality fizzles — no caster found.'); return; }
    const dist = Math.max(Math.abs(caster.x - params.x), Math.abs(caster.y - params.y));
    if (dist > 2) { pushLog(g, 'Mortality: target out of range (2).'); return; }
    const region = g.viewRegion;
    const units = unitsAtTileInRegion(g, params.x, params.y, region).filter((u: any) => u.kind !== 'Avatar');
    const mortals = units.filter(_isMortalUnit);
    if (!mortals.length) { pushLog(g, 'Mortality finds no Mortal minions to destroy.'); return; }
    for (const target of mortals) {
      const lethal = unitThresholdHPPlus(g, target);
      damage(g, target, lethal);
      pushLog(g, `Mortality claims ${target.name}.`);
    }
  },
},

{
  code: 'OCCULT_RITUAL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const units = unitsAtTileInRegion(g, params.x, params.y, region);
    const count = units.filter((u: any) => u.player === pid && _isSpellcasterUnitLocal(g, u)).length;
    if (count <= 0) { pushLog(g, 'Occult Ritual: no allied Spellcasters at this location.'); return; }
    g.mana[pid] = (g.mana[pid] ?? 0) + (2 * count);
    pushLog(g, `Occult Ritual yields (${2 * count}) mana this turn.`);
  },
},

{
  code: 'PSIONIC_BLAST',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const units = unitsAtTileInRegion(g, params.x, params.y, region).filter((u: any) => u.kind !== 'Avatar');
    if (!units.length) { pushLog(g, 'Psionic Blast: no minions at the target location.'); return; }
    for (const unit of units) {
      damage(g, unit, 1);
    }
    (g as any)._disableAreas ??= [];
    (g as any)._disableAreas.push({ x: params.x, y: params.y, expiresOnPid: pid });
    pushLog(g, `Psionic Blast wracks ${units.length} minion(s) and leaves the area disabled until your next turn.`);
  },
},

{
  code: 'RAIN_OF_ARROWS',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    let hits = 0;
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const cell = cellOfBoard(g, x, y);
        for (const unit of cell.units || []) {
          if (unit.region === 'surface' && unit.kind !== 'Avatar') {
            damage(g, unit, 1);
            hits++;
          }
        }
      }
    }
    if (hits > 0) pushLog(g, `Rain of Arrows pelts ${hits} aboveground minion(s).`);
    else pushLog(g, 'Rain of Arrows finds no aboveground minions to strike.');
  },
},

{
  code: 'UNLIKELY_ALLIANCE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const rarities = new Set<string>();
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const cell = cellOfBoard(g, x, y);
        for (const unit of cell.units || []) {
          if (unit.player !== pid || unit.kind === 'Avatar') continue;
          const source = (unit as any)._srcCard;
          const rarity = (unit as any).rarity ?? source?.rarity;
          if (typeof rarity === 'string' && rarity.trim()) rarities.add(rarity.trim());
        }
      }
    }
    if (!rarities.size) { pushLog(g, 'Unlikely Alliance: no allied minions with recorded rarities.'); return; }
    let drawn = 0;
    const total = rarities.size;
    for (let i = 0; i < total; i++) {
      const ok = _drawOneWithChoiceLocal(
        g,
        pid,
        `Unlikely Alliance — choose a deck to draw from (${total - i} draw(s) remaining).`
      );
      if (!ok) break;
      drawn += 1;
    }
    if (drawn > 0) pushLog(g, `Unlikely Alliance draws ${drawn} card(s) for diverse allies.`);
    else pushLog(g, 'Unlikely Alliance — no cards left to draw.');
  },
},

{
  code: 'MINOR_EXPLOSION',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Minor Explosion fizzles — no caster found.'); return; }
    const dist = Math.max(Math.abs(caster.x - params.x), Math.abs(caster.y - params.y));
    if (dist > 2) { pushLog(g, 'Minor Explosion: target out of range (2).'); return; }
    const region = g.viewRegion;
    const units = unitsAtTileInRegion(g, params.x, params.y, region);
    if (!units.length) { pushLog(g, 'Minor Explosion: empty location.'); return; }
    for (const unit of units) {
      damage(g, unit, 3);
    }
    pushLog(g, `Minor Explosion blasts ${units.length} unit(s) for 3 damage at (${params.x + 1}, ${params.y + 1}).`);
  },
},

{
  code: 'BOIL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Boil fizzles — no caster found.'); return; }
    const dist = Math.max(Math.abs(caster.x - params.x), Math.abs(caster.y - params.y));
    if (dist > 2) { pushLog(g, 'Boil: target out of range (2).'); return; }
    const cell = cellOfBoard(g, params.x, params.y);
    const site = cell.site;
    if (!site || !site.isWater) { pushLog(g, 'Boil requires a water site.'); return; }
    const victims = (cell.units || []).filter((u: any) => u.kind !== 'Avatar' && (u.region === 'surface' || u.region === 'underwater'));
    if (!victims.length) { pushLog(g, 'Boil: no minions occupying the water site.'); return; }
    for (const unit of victims) {
      const lethal = unitThresholdHPPlus(g, unit);
      damage(g, unit, lethal);
    }
    pushLog(g, `Boil scalds ${victims.length} minion(s) at (${params.x + 1}, ${params.y + 1}).`);
  },
},

{
  code: 'EXORCISM',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Exorcism fizzles — no caster found.'); return; }
    const dist = Math.max(Math.abs(caster.x - params.x), Math.abs(caster.y - params.y));
    if (dist > 2) { pushLog(g, 'Exorcism: target out of range (2).'); return; }
    const region = g.viewRegion;
    const units = unitsAtTileInRegion(g, params.x, params.y, region).filter((u: any) => u.kind !== 'Avatar');
    const targets = units.filter(_isDemonOrUndead);
    if (!targets.length) { pushLog(g, 'Exorcism finds no Demons or Undead to banish.'); return; }
    for (const unit of targets) {
      const prevFlag = (unit as any)._banishOnDeath;
      (unit as any)._banishOnDeath = true;
      const lethal = unitThresholdHPPlus(g, unit) + 999;
      damage(g, unit, lethal);
      const stillPresent = cellOfBoard(g, params.x, params.y).units?.some((u: any) => u.id === unit.id);
      if (stillPresent) {
        if (prevFlag === undefined) delete (unit as any)._banishOnDeath;
        else (unit as any)._banishOnDeath = prevFlag;
      }
    }
    pushLog(g, `Exorcism banishes ${targets.length} unholy minion(s).`);
  },
},

{
  code: 'CHAOS_TWISTER',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const choices = cell?.units?.filter((u: any) => u.region === region && u.kind !== 'Avatar') || [];
    if (!choices.length) { pushLog(g, 'Chaos Twister: target a non-Avatar minion.'); return; }
    let target = choices[0];
    if (choices.length > 1) {
      const menu = choices.map((u: any, i: number) => `${i + 1}) ${u.name} (P${u.player})`).join('\n');
      const ans = window.prompt(`Chaos Twister — choose a minion:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > choices.length) { pushLog(g, 'Chaos Twister cancelled.'); return; }
      target = choices[idx - 1];
    }
    const legal: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const destCell = cellOfBoard(g, x, y);
      if (_regionAllowedForUnitAtCell(target, target.region, destCell)) legal.push({ x, y });
    }
    if (!legal.length) { pushLog(g, 'Chaos Twister cannot find a legal landing spot.'); return; }
    const landing = _randomElement(legal)!;
    _moveUnitTo(g, target, landing.x, landing.y, target.region);
    pushLog(g, `Chaos Twister flings ${target.name} to (${landing.x + 1}, ${landing.y + 1}).`);
    const base = target.atk ?? target.power ?? 0;
    if (base > 0) {
      const victims = unitsAtTileInRegion(g, landing.x, landing.y, target.region);
      for (const foe of victims) {
        const amount = lethalAmountLocal(g, target, foe, base);
        damage(g, foe, amount);
        pushLog(g, `Chaos Twister lashes ${foe.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
      }
    }
  },
},

{
  code: 'RECALL',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Recall fizzles — no caster found.'); return; }
    const allies: Array<{ unit: any; label: string }> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      for (const u of cell.units || []) {
        if (u.player === pid && u.kind !== 'Avatar') {
          allies.push({ unit: u, label: `${u.name} @ (${x + 1}, ${y + 1}) [${u.region}]` });
        }
      }
    }
    if (!allies.length) { pushLog(g, 'Recall: you control no allied minions.'); return; }
    const menu = allies.map((entry, i) => `${i + 1}) ${entry.label}`).join('\n');
    const ans = window.prompt(`Recall — choose minions (comma separated).\n${menu}\nBlank = all, 0 = cancel`, '');
    if (ans === null) { pushLog(g, 'Recall cancelled.'); return; }
    const trimmed = ans.trim();
    if (trimmed === '0') { pushLog(g, 'Recall cancelled.'); return; }
    let selected = allies.map(a => a.unit);
    if (trimmed !== '') {
      const picks = [...new Set(trimmed.split(/[,\s]+/).map(v => parseInt(v, 10)).filter(n => Number.isFinite(n) && n > 0 && n <= allies.length))];
      if (!picks.length) { pushLog(g, 'Recall: no valid selections.'); return; }
      selected = picks.map(i => allies[i - 1].unit);
    }
    for (const unit of selected) {
      _moveUnitTo(g, unit, caster.x, caster.y, caster.region ?? 'surface');
      pushLog(g, `${unit.name} recalls to (${caster.x + 1}, ${caster.y + 1}).`);
    }
  },
},

{
  code: 'TELEPORT',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Teleport fizzles — no caster found.'); return; }
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell?.site) { pushLog(g, 'Teleport requires a site destination.'); return; }
    const allies: Array<any> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      for (const u of cellOfBoard(g, x, y).units || []) {
        if (u.player === pid) allies.push(u);
      }
    }
    if (!allies.length) { pushLog(g, 'Teleport: you have no allied units.'); return; }
    const helpers: any = getSpellHostHelpers();
    const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;

    const performTeleport = (original: any) => {
      const destCell = cellOfBoard(g, params.x, params.y);
      if (!destCell?.site) { pushLog(g, 'Teleport fizzles — destination is no longer a site.'); if (requestSync) requestSync(); return; }
      let unit = original;
      const id = (original as any)?.id;
      if (id) {
        const located = _findUnitById(g, id);
        if (located) unit = located;
      }
      if (!unit) { pushLog(g, 'Teleport fizzles — chosen unit missing.'); if (requestSync) requestSync(); return; }
      if (!_regionAllowedForUnitAtCell(unit, 'surface', destCell)) {
        pushLog(g, `${unit.name} cannot stand on that site.`);
        if (requestSync) requestSync();
        return;
      }
      _moveUnitTo(g, unit, params.x, params.y, 'surface');
      pushLog(g, `${unit.name} teleports to (${params.x + 1}, ${params.y + 1}) surface.`);
      if (requestSync) requestSync();
    };

    let ally = allies[0];
    const pendingTeleport = (g as any)._pendingTeleport as { pid?: any; unitId?: string } | undefined;
    const pendingTeleportUnitId =
      pendingTeleport && pendingTeleport.pid === pid ? pendingTeleport.unitId : undefined;
    if (pendingTeleportUnitId) {
      const preset = allies.find((u: any) => String((u as any)?.id ?? '') === String(pendingTeleportUnitId));
      if (preset) ally = preset;
    }
    else if (allies.length > 1) {
      const menu = allies.map((u: any, i: number) => `${i + 1}) ${u.name} @ (${u.x + 1}, ${u.y + 1}) [${u.region}]`).join('\n');
      const ans = window.prompt(`Teleport — choose an ally to move:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > allies.length) { pushLog(g, 'Teleport cancelled.'); return; }
      ally = allies[idx - 1];
    }
    performTeleport(ally);
  },
},

{
  code: 'WINDBLAST',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const dirRaw = window.prompt('Windblast direction (N, S, E, W)?', 'N');
    if (!dirRaw) { pushLog(g, 'Windblast cancelled.'); return; }
    const dir = dirRaw.trim().toUpperCase();
    const map: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const delta = map[dir];
    if (!delta) { pushLog(g, 'Windblast: invalid direction.'); return; }
    const moves: Array<{ unit: any; x: number; y: number; region: any }> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      if (!cell.site) continue;
      for (const unit of cell.units || []) {
        if (unit.region !== 'surface') continue;
        const nx = x + delta[0], ny = y + delta[1];
        if (!insideBoard(g, nx, ny)) continue;
        const dest = cellOfBoard(g, nx, ny);
        if (_regionAllowedForUnitAtCell(unit, 'surface', dest)) moves.push({ unit, x: nx, y: ny, region: 'surface' });
      }
    }
    if (!moves.length) { pushLog(g, 'Windblast has no effect.'); return; }
    for (const move of moves) {
      _moveUnitTo(g, move.unit, move.x, move.y, move.region);
    }
    pushLog(g, `Windblast pushes ${moves.length} unit(s) ${dir}.`);
  },
},

{
  code: 'BACKSTAB',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const enemies = unitsAtTileInRegion(g, params.x, params.y, region).filter((u: any) => u.player !== pid && u.kind !== 'Avatar' && u.tapped);
    if (!enemies.length) { pushLog(g, 'Backstab: choose a tile with a tapped enemy minion.'); return; }
    let target = enemies[0];
    if (enemies.length > 1) {
      const menu = enemies.map((u: any, i: number) => `${i + 1}) ${u.name} (P${u.player})`).join('\n');
      const ans = window.prompt(`Backstab — pick the victim:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > enemies.length) { pushLog(g, 'Backstab cancelled.'); return; }
      target = enemies[idx - 1];
    }
    const allies: Array<any> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      for (const unit of cell.units || []) {
        if (unit.player === pid && unit.kind !== 'Avatar' && unit.region === region && _chebyshev(unit.x, unit.y, params.x, params.y) <= 1) allies.push(unit);
      }
    }
    if (!allies.length) { pushLog(g, 'Backstab: no adjacent allied minion.'); return; }
    let attacker = allies[0];
    if (allies.length > 1) {
      const menu = allies.map((u: any, i: number) => `${i + 1}) ${u.name} @ (${u.x + 1}, ${u.y + 1})`).join('\n');
      const ans = window.prompt(`Backstab — choose the attacker:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > allies.length) { pushLog(g, 'Backstab cancelled.'); return; }
      attacker = allies[idx - 1];
    }
    if (_chebyshev(attacker.x, attacker.y, params.x, params.y) > 0) {
      const destCell = cellOfBoard(g, params.x, params.y);
      if (!_regionAllowedForUnitAtCell(attacker, attacker.region, destCell)) {
        pushLog(g, `${attacker.name} cannot move onto that tile.`);
        return;
      }
      _moveUnitTo(g, attacker, params.x, params.y, attacker.region);
    }
    const base = attacker.atk ?? attacker.power ?? 0;
    const amount = lethalAmountLocal(g, attacker, target, base);
    damage(g, target, amount);
    pushLog(g, `Backstab — ${attacker.name} strikes ${target.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
  },
},

{
  code: 'FIRE_HARPOONS',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Fire Harpoons fizzles — no caster found.'); return false; }
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const targets = cell?.units?.filter((u: any) => u.region === region && u.kind !== 'Avatar') || [];
    if (!targets.length) { pushLog(g, 'Fire Harpoons: target a minion.'); return false; }
    let target = targets[0];
    if (targets.length > 1) {
      const menu = targets.map((u: any, i: number) => `${i + 1}) ${u.name} (P${u.player})`).join('\n');
      const ans = window.prompt(`Fire Harpoons — choose a minion:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > targets.length) { pushLog(g, 'Fire Harpoons cancelled.'); return false; }
      target = targets[idx - 1];
    }
    const d = _chebyshev(caster.x, caster.y, target.x, target.y);
    if (d !== 1) { pushLog(g, 'Fire Harpoons: target must be adjacent to the caster.'); return false; }
    if (!cell?.site || !cell.site.isWater) { pushLog(g, 'Fire Harpoons requires the minion to be atop a water site.'); return false; }
    damage(g, target, 1);
    _moveUnitTo(g, target, caster.x, caster.y, caster.region ?? target.region);
    pushLog(g, `Fire Harpoons drags ${target.name} to the caster.`);
    const drawn = _drawFromSpellbook(g, pid, 1);
    if (drawn > 0) pushLog(g, 'Fire Harpoons — drew 1 card.');
    return true;
  },
},

{
  code: 'DROWN',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell?.site || !cell.site.isWater) { pushLog(g, 'Drown requires a water site.'); return false; }
    const units = cell.units?.filter((u: any) => u.region === 'surface' && u.kind !== 'Avatar') || [];
    const artifacts = (cell.artifacts || []).filter((a: any) => !a.carriedBy && a.region === 'surface');
    if (!units.length && !artifacts.length) { pushLog(g, 'Drown finds nothing on the surface.'); return false; }
    let choice: { kind: 'unit'; ref: any } | { kind: 'artifact'; ref: any };
    const options: Array<string> = [];
    let idxCount = 0;
    const lookup: Array<{ kind: 'unit' | 'artifact'; ref: any }> = [];
    for (const u of units) {
      idxCount += 1;
      options.push(`${idxCount}) Unit — ${u.name}`);
      lookup.push({ kind: 'unit', ref: u });
    }
    for (const a of artifacts) {
      idxCount += 1;
      options.push(`${idxCount}) Artifact — ${a.name}`);
      lookup.push({ kind: 'artifact', ref: a });
    }
    const ans = window.prompt(`Drown — choose a target:\n${options.join('\n')}\n0 = cancel`, '1');
    const idx = ans ? parseInt(ans, 10) : 0;
    if (!Number.isFinite(idx) || idx <= 0 || idx > lookup.length) { pushLog(g, 'Drown cancelled.'); return false; }
    choice = lookup[idx - 1];
    if (choice.kind === 'unit') {
      const unit = choice.ref;
      if (forceSubmergeUnitLocal(g, unit, params.x, params.y, cell, `${unit.name} cannot survive underwater and drowns.`)) {
        pushLog(g, `${unit.name} is dragged underwater.`);
      }
    } else {
      const art = choice.ref;
      art.region = 'underwater';
      art.x = params.x;
      art.y = params.y;
      pushLog(g, `${art.name} sinks beneath the waves.`);
    }
    return true;
  },
},

{
  code: 'ICE_LANCE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Ice Lance fizzles — no caster found.'); return; }
    const helpers = getSpellHostHelpers();
    const selectOne = typeof helpers?.selectOne === 'function' ? helpers.selectOne : null;
    const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;
    const map: Record<'N' | 'S' | 'E' | 'W', [number, number]> = {
      N: [0, -1],
      S: [0, 1],
      E: [1, 0],
      W: [-1, 0],
    };
    const damages = [3, 2, 1];

    const resolveInDirection = async (dir: 'N' | 'S' | 'E' | 'W') => {
      const delta = map[dir];
      for (let step = 1; step <= 3; step++) {
        const tx = caster.x + delta[0] * step;
        const ty = caster.y + delta[1] * step;
        if (!insideBoard(g, tx, ty)) break;
        const candidates = unitsAtTileInRegion(g, tx, ty, caster.region ?? 'surface');
        if (!candidates.length) continue;

        const defaultTarget =
          candidates.find((u: any) => u.player !== pid) ?? candidates[0];

        let victim = defaultTarget;
        if (candidates.length > 1 && selectOne) {
          const choice = await selectOne({
            title: 'Ice Lance',
            message: `Choose a target at (${tx + 1}, ${ty + 1}).`,
            options: candidates.map((u: any, i: number) => ({
              label: `${u.name} (P${u.player})`,
              value: i,
            })),
            allowCancel: true,
            cancelLabel: 'Default target',
          });
          if (choice != null && choice >= 0 && choice < candidates.length) {
            victim = candidates[choice];
          }
        }

        if (!victim) continue;
        const amount = lethalAmountLocal(g, caster, victim, damages[step - 1]);
        damage(g, victim, amount, { sourceElement: 'Water' });
        pushLog(g, `Ice Lance pierces ${victim.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
      }
      if (requestSync) requestSync();
    };

    const pendingDir = (g as any)._pendingIceLanceDir as 'N' | 'S' | 'E' | 'W' | undefined;
    if (pendingDir) {
      delete (g as any)._pendingIceLanceDir;
      void (async () => {
        await resolveInDirection(pendingDir);
      })();
      return;
    }

    const dirRaw = typeof window !== 'undefined' && typeof window.prompt === 'function'
      ? window.prompt('Ice Lance direction (N, S, E, W)?', 'N')
      : 'N';
    if (!dirRaw) { pushLog(g, 'Ice Lance cancelled.'); if (requestSync) requestSync(); return; }
    const dirUp = dirRaw.trim().toUpperCase() as 'N' | 'S' | 'E' | 'W';
    if (!map[dirUp]) { pushLog(g, 'Ice Lance: invalid direction.'); if (requestSync) requestSync(); return; }
    void resolveInDirection(dirUp);
  },
},

{
  code: 'IMMOLATION',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Immolation fizzles — no caster found.'); return; }
    const target = unitsAtTileInRegion(g, params.x, params.y, g.viewRegion).find((u: any) => u.kind !== 'Avatar');
    if (!target) { pushLog(g, 'Immolation: target a minion.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 1) { pushLog(g, 'Immolation: target must be nearby.'); return; }
    damage(g, target, lethalAmountLocal(g, caster, target, 7), { sourceElement: 'Fire' });
    pushLog(g, `Immolation engulfs ${target.name}.`);
  },
},

{
  code: 'HEAT_RAY',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Heat Ray fizzles — no caster found.'); return; }
    const pendingDir = (g as any)._pendingHeatRayDir as 'N' | 'S' | 'E' | 'W' | undefined;
    if (pendingDir) delete (g as any)._pendingHeatRayDir;
    if (!pendingDir) { pushLog(g, 'Heat Ray cancelled — no direction selected.'); return; }
    const dir = pendingDir;
    const map: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const delta = map[dir];
    if (!delta) { pushLog(g, 'Heat Ray: invalid direction.'); return; }
    let tx = caster.x + delta[0];
    let ty = caster.y + delta[1];
    let hits = 0;
    while (insideBoard(g, tx, ty)) {
      const candidates = unitsAtTileInRegion(g, tx, ty, caster.region ?? 'surface');
      if (candidates.length) {
        const victim = candidates.find((u: any) => u.player !== pid) || candidates[0];
        const amount = lethalAmountLocal(g, caster, victim, 2);
        damage(g, victim, amount, { sourceElement: 'Fire' });
        pushLog(g, `Heat Ray scorches ${victim.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
        hits++;
      }
      tx += delta[0];
      ty += delta[1];
    }
    if (!hits) pushLog(g, 'Heat Ray burns a smoking line with no victims.');
  },
},

{
  code: 'DISINTEGRATE',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Disintegrate fizzles — no caster found.'); return; }
    const region = g.viewRegion;
    const target = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.kind !== 'Avatar');
    if (!target) { pushLog(g, 'Disintegrate: target a minion.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 1) { pushLog(g, 'Disintegrate: target out of range.'); return; }
    const prevFlag = (target as any)._banishOnDeath;
    (target as any)._banishOnDeath = true;
    const lethal = unitThresholdHPPlus(g, target) + 999;
    damage(g, target, lethal, { sourceElement: 'Arcane' });
    const stillThere = cellOfBoard(g, params.x, params.y).units?.some((u: any) => u.id === target.id);
    if (stillThere) {
      if (prevFlag === undefined) delete (target as any)._banishOnDeath;
      else (target as any)._banishOnDeath = prevFlag;
    }
    pushLog(g, `Disintegrate reduces ${target.name} to nothingness.`);
  },
},

{
  code: 'POISON_NOVA',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Poison Nova fizzles — no caster found.'); return; }
    let affected = 0;
    for (let y = caster.y - 1; y <= caster.y + 1; y++) for (let x = caster.x - 1; x <= caster.x + 1; x++) {
      if (!insideBoard(g, x, y)) continue;
      const units = unitsAtTileInRegion(g, x, y, caster.region ?? 'surface');
      for (const unit of units) {
        if (unit.kind !== 'Avatar' && !(unit.id === caster.id && unit.player === pid)) {
          const amount = lethalAmountLocal(g, caster, unit, 1);
          damage(g, unit, amount, { sourceElement: 'Poison' });
          affected++;
        }
      }
    }
    pushLog(g, `Poison Nova envenoms ${affected} nearby minion(s).`);
  },
},

{
  code: 'INCINERATE',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Incinerate fizzles — no caster found.'); return; }
    const distCaster = _chebyshev(caster.x, caster.y, params.x, params.y);
    let inRange = distCaster <= 1;
    if (!inRange) {
      outer: for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
        const cell = cellOfBoard(g, x, y);
        for (const u of cell.units || []) {
          if (u.player === pid && _unitHasSubtype(u, 'Dragon') && _chebyshev(u.x, u.y, params.x, params.y) <= 1) {
            inRange = true;
            break outer;
          }
        }
      }
    }
    if (!inRange) { pushLog(g, 'Incinerate: target must be near the caster or an allied Dragon.'); return; }
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const dragonsHere = (cell.units || []).filter((u: any) => u.player === pid && _unitHasSubtype(u, 'Dragon'));
    const units = unitsAtTileInRegion(g, params.x, params.y, region);
    if (!units.length) { pushLog(g, 'Incinerate: no units at that location.'); return; }
    for (const unit of units) {
      if (dragonsHere.some((d: any) => d.id === unit.id)) continue;
      const amount = lethalAmountLocal(g, caster, unit, 4);
      damage(g, unit, amount, { sourceElement: 'Fire' });
    }
    pushLog(g, `Incinerate sears units at (${params.x + 1}, ${params.y + 1}).`);
  },
},

{
  code: 'LEAP_ATTACK',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const allies: Array<any> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      for (const u of cellOfBoard(g, x, y).units || []) {
        if (u.player === pid && u.kind !== 'Avatar' && u.region === region) allies.push(u);
      }
    }
    if (!allies.length) { pushLog(g, 'Leap Attack: you have no allied minions to leap.'); return; }
    let ally = allies[0];
    if (allies.length > 1) {
      const menu = allies.map((u: any, i: number) => `${i + 1}) ${u.name} @ (${u.x + 1}, ${u.y + 1})`).join('\n');
      const ans = window.prompt(`Leap Attack — choose a leaping ally:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > allies.length) { pushLog(g, 'Leap Attack cancelled.'); return; }
      ally = allies[idx - 1];
    }
    const dirRaw = window.prompt('Leap direction (N, S, E, W, NE, NW, SE, SW)?', 'N');
    if (!dirRaw) { pushLog(g, 'Leap Attack cancelled.'); return; }
    const dir = dirRaw.trim().toUpperCase();
    const map: Record<string, [number, number]> = {
      N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
      NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1],
    };
    const delta = map[dir];
    if (!delta) { pushLog(g, 'Leap Attack: invalid direction.'); return; }
    const nx = ally.x + delta[0];
    const ny = ally.y + delta[1];
    if (!insideBoard(g, nx, ny)) { pushLog(g, 'Leap Attack: leap would leave the board.'); return; }
    const dest = cellOfBoard(g, nx, ny);
    if (!_regionAllowedForUnitAtCell(ally, ally.region, dest)) { pushLog(g, `${ally.name} cannot land there.`); return; }
    _moveUnitTo(g, ally, nx, ny, ally.region);
    const enemies = unitsAtTileInRegion(g, nx, ny, ally.region).filter((u: any) => u.player !== pid && u.kind !== 'Avatar');
    if (!enemies.length) { pushLog(g, `${ally.name} lands with no foes to strike.`); return; }
    const base = ally.atk ?? ally.power ?? 0;
    for (const foe of enemies) {
      const amount = lethalAmountLocal(g, ally, foe, base);
      damage(g, foe, amount);
      pushLog(g, `${ally.name} slams ${foe.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
    }
  },
},

{
  code: 'RIPTIDE',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell?.site || !cell.site.isWater) { pushLog(g, 'Riptide requires a water site.'); return; }
    const adj: Array<{ x: number; y: number }> = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx, dy]) => ({ x: params.x + dx, y: params.y + dy }))
      .filter(p => insideBoard(g, p.x, p.y));
    const candidates: Array<any> = [];
    for (const pos of adj) {
      const list = unitsAtTileInRegion(g, pos.x, pos.y, 'surface').filter((u: any) => u.kind !== 'Avatar');
      candidates.push(...list);
    }
    if (!candidates.length) { pushLog(g, 'Riptide finds no aboveground units adjacent to the site.'); return; }
    let target = candidates[0];
    if (candidates.length > 1) {
      const helpers = getSpellHostHelpers();
      const selectOne = typeof helpers?.selectOne === 'function' ? helpers.selectOne : null;
      if (selectOne) {
        void (async () => {
          const choice = await selectOne({
            title: 'Riptide',
            message: 'Choose a unit to drag into the whirlpool.',
            options: candidates.map((u: any, i: number) => ({
              label: `${u.name} (P${u.player}) @ (${u.x + 1}, ${u.y + 1})`,
              value: i,
            })),
            allowCancel: true,
            cancelLabel: 'Cancel',
          });
          if (choice == null || choice < 0 || choice >= candidates.length) {
            pushLog(g, 'Riptide cancelled.');
            if (typeof helpers?.requestGameSync === 'function') helpers.requestGameSync();
            return;
          }
          const picked = candidates[choice];
          _moveUnitTo(g, picked, params.x, params.y, 'surface');
          pushLog(g, `Riptide pulls ${picked.name} into (${params.x + 1}, ${params.y + 1}).`);
          const drawn = _drawFromSpellbook(g, pid, 1);
          if (drawn > 0) pushLog(g, 'Riptide — drew 1 card.');
          if (typeof helpers?.requestGameSync === 'function') helpers.requestGameSync();
        })();
        return;
      } else {
        const menu = candidates.map((u: any, i: number) => `${i + 1}) ${u.name} (P${u.player}) @ (${u.x + 1}, ${u.y + 1})`).join('\n');
        const ans = window.prompt(`Riptide — choose a unit to drag:\n${menu}\n0 = cancel`, '1');
        const idx = ans ? parseInt(ans, 10) : 0;
        if (!Number.isFinite(idx) || idx <= 0 || idx > candidates.length) { pushLog(g, 'Riptide cancelled.'); return; }
        target = candidates[idx - 1];
      }
    }
    _moveUnitTo(g, target, params.x, params.y, 'surface');
    pushLog(g, `Riptide pulls ${target.name} into (${params.x + 1}, ${params.y + 1}).`);
    const drawn = _drawFromSpellbook(g, pid, 1);
    if (drawn > 0) pushLog(g, 'Riptide — drew 1 card.');
  },
},

{
  code: 'REPLICATION',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Replication fizzles — no caster found.'); return; }
    const carried = (g.artifacts || []).filter((a: any) => a.carriedBy === caster.id);
    if (!carried.length) { pushLog(g, 'Replication: caster carries no artifacts.'); return; }
    let source = carried[0];
    if (carried.length > 1) {
      const menu = carried.map((a: any, i: number) => `${i + 1}) ${a.name}`).join('\n');
      const ans = window.prompt(`Replication — choose an artifact to copy:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > carried.length) { pushLog(g, 'Replication cancelled.'); return; }
      source = carried[idx - 1];
    }
    const clone = _cloneDeep(source);
    clone.id = _rngId();
    clone.carriedBy = caster.id;
    clone.x = caster.x;
    clone.y = caster.y;
    clone.region = caster.region ?? 'surface';
    g.artifacts.push(clone);
    const cell = cellOfBoard(g, caster.x, caster.y);
    (caster.carrying ??= []).push(clone.id);
    if (!cell.artifacts.some((a: any) => a.id === clone.id)) cell.artifacts.push(clone);
    pushLog(g, `Replication conjures another ${clone.name}.`);
  },
},

{
  code: 'EXTINGUISH',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Extinguish fizzles — no caster found.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 2) { pushLog(g, 'Extinguish: target out of range (2).'); return; }
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const victims = unitsAtTileInRegion(g, params.x, params.y, region).filter((u: any) => u.kind !== 'Avatar' && String(u.element).toLowerCase() === 'fire');
    let banished = 0;
    for (const unit of victims) {
      const prev = (unit as any)._banishOnDeath;
      (unit as any)._banishOnDeath = true;
      const lethal = unitThresholdHPPlus(g, unit) + 999;
      damage(g, unit, lethal, { sourceElement: 'Water' });
      const still = cell.units?.some((u: any) => u.id === unit.id);
      if (still) {
        if (prev === undefined) delete (unit as any)._banishOnDeath;
        else (unit as any)._banishOnDeath = prev;
      } else banished++;
    }
    const auraIds: string[] = [...(cell.auraIds || [])];
    let auraRemoved = 0;
    if (Array.isArray(g.auras)) {
      for (const auraId of auraIds) {
        const auraIndex = g.auras.findIndex((a: any) => a.id === auraId && (/fire/i.test(a.name) || String(a.element ?? '').toLowerCase() === 'fire'));
        if (auraIndex >= 0) {
          const aura = g.auras[auraIndex];
          g.auras.splice(auraIndex, 1);
          cell.auraIds = (cell.auraIds || []).filter((id: string) => id !== auraId);
          if (aura) releaseAuraSourceCard(g, aura);
          auraRemoved++;
        }
      }
    }
    pushLog(g, `Extinguish quenches ${banished} fire minion(s) and ${auraRemoved} aura(s).`);
  },
},

{
  code: 'FROST_NOVA',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Frost Nova fizzles — no caster found.'); return; }
    let frozen = 0;
    for (let y = caster.y - 1; y <= caster.y + 1; y++) for (let x = caster.x - 1; x <= caster.x + 1; x++) {
      if (!insideBoard(g, x, y)) continue;
      const units = unitsAtTileInRegion(g, x, y, caster.region ?? 'surface');
      for (const unit of units) {
        if (unit.player === pid || unit.kind === 'Avatar') continue;
        unit.tapped = true;
        (unit as any).skipUntapOnce = true;
        (g as any)._disableAreas ??= [];
        (g as any)._disableAreas.push({ x: unit.x, y: unit.y, expiresOnPid: pid });
        frozen++;
      }
    }
    pushLog(g, `Frost Nova freezes ${frozen} enemy minion(s) until your next turn.`);
  },
},

{
  code: 'MAJOR_EXPLOSION',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Major Explosion fizzles — no caster found.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 2) { pushLog(g, 'Major Explosion: target out of range (2).'); return; }
    let affected = 0;
    for (let y = params.y - 1; y <= params.y + 1; y++) for (let x = params.x - 1; x <= params.x + 1; x++) {
      if (!insideBoard(g, x, y)) continue;
      const units = unitsAtTileInRegion(g, x, y, g.viewRegion);
      for (const unit of units) {
        const amount = lethalAmountLocal(g, caster, unit, 3);
        damage(g, unit, amount, { sourceElement: 'Fire' });
        affected++;
      }
    }
    pushLog(g, `Major Explosion devastates ${affected} unit(s) around (${params.x + 1}, ${params.y + 1}).`);
  },
},

{
  code: 'WILDFIRE',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Wildfire fizzles — no caster found.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 1) {
      pushLog(g, 'Wildfire can only ignite a nearby site.');
      return;
    }
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell?.site || cell.site.rubble) {
      pushLog(g, 'Wildfire must ignite atop a standing site.');
      return;
    }
    (g as any)._wildfires ??= [];
    const already = (g as any)._wildfires.find((wf: any) => wf.x === params.x && wf.y === params.y);
    if (already) {
      pushLog(g, 'Wildfire already rages on that site.');
      return;
    }
    (g as any)._wildfires.push({
      id: _rngId(),
      pid,
      x: params.x,
      y: params.y,
      visited: [`${params.x},${params.y}`],
    });
    pushLog(g, `Wildfire ignites at (${params.x + 1}, ${params.y + 1}). It will burn at each end step until it exhausts nearby fuel.`);
  },
},

{
  code: 'PACT_WITH_THE_DEVIL',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Pact with the Devil fizzles — no caster found.'); return; }
    const choice = window.prompt('Pact with the Devil — enter 1 to sacrifice the caster, 2 to lose half your life (rounded up).', '2');
    if (choice === null) { pushLog(g, 'Pact with the Devil cancelled.'); return; }
    if (choice.trim() === '1') {
      const prev = (caster as any)._banishOnDeath;
      (caster as any)._banishOnDeath = true;
      const lethal = unitThresholdHPPlus(g, caster) + 999;
      damage(g, caster, lethal);
      if ((caster as any).life > 0) {
        if (prev === undefined) delete (caster as any)._banishOnDeath;
        else (caster as any)._banishOnDeath = prev;
      }
      pushLog(g, `${caster.name} is sacrificed to dark powers.`);
    } else if (choice.trim() === '2') {
      const av = g.avatars?.[pid];
      if (!av) { pushLog(g, 'Pact with the Devil: avatar not found.'); return; }
      const loss = Math.ceil(Math.max(0, av.life ?? 0) / 2);
      if (loss === 0) { pushLog(g, 'Pact with the Devil: no life to pay.'); return; }
      av.life = Math.max(0, (av.life ?? 0) - loss);
      pushLog(g, `Pact with the Devil exacts ${loss} life from you.`);
    } else {
      pushLog(g, 'Pact with the Devil cancelled.');
      return;
    }
    const drawn = _drawFromSpellbook(g, pid, 3);
    if (drawn > 0) pushLog(g, 'Pact with the Devil — drew 3 cards.');
  },
},

{
  code: 'DREAM_QUEST',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const avatar = g?.avatars?.[pid];
    const avatarHere = avatar && avatar.x === params.x && avatar.y === params.y && avatar.region === region ? [avatar] : [];
    const artifactCandidates = (cell?.artifacts?.filter((artifact: any) => {
      if ((artifact?.region ?? 'surface') !== region) return false;
      const owner = artifact?.owner ?? artifact?.player;
      if (owner !== pid) return false;
      return /Omphalos$/i.test(String(artifact?.name ?? ''));
    }) ?? []);
    const siteCandidate = cell?.site && !cell.site.rubble && cell.site.controller === pid && /River of Flame/i.test(String(cell.site.name ?? ''))
      ? [cell.site]
      : [];
    const candidates = [
      ...avatarHere,
      ...(cell?.units?.filter((u: any) => u.player === pid && u.region === region) || []),
      ...artifactCandidates,
      ...siteCandidate,
    ];
    const target = candidates.find((u: any) =>
      u.kind === 'Avatar'
        ? true
        : u.kind === 'Artifact'
          ? /Omphalos$/i.test(String(u.name ?? ''))
          : u.type === 'Site'
            ? /River of Flame/i.test(String(u.name ?? ''))
            : _isSpellcasterUnitLocal(g, u)
    );
    if (!target) { pushLog(g, 'Dream-Quest: choose an allied Spellcaster, Omphalos/River of Flame, or your avatar.'); return; }
    if (typeof (target as any).tapped === 'boolean') {
      (target as any).tapped = true;
    }
    (target as any)._dreamQuest = { pid, readyTurn: (g.turnNumber ?? 0) + 1 };
    (target as any)._dreamQuestAsleep = true;
    pushLog(g, `${target.name} begins a dream-quest.`);
  },
},

{
  code: 'ARC_LIGHTNING',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Arc Lightning fizzles — no caster found.'); return; }
    const region = g.viewRegion;
    const target = unitsAtTileInRegion(g, params.x, params.y, region)[0];
    if (!target) { pushLog(g, 'Arc Lightning: no unit at that location.'); return; }
    if (_chebyshev(caster.x, caster.y, target.x, target.y) > 1) { pushLog(g, 'Arc Lightning: target must be nearby.'); return; }
    const amount = lethalAmountLocal(g, caster, target, 4);
    damage(g, target, amount, { sourceElement: 'Lightning' });
    pushLog(g, `Arc Lightning blasts ${target.name} for ${amount >= 999 ? 'lethal damage' : amount}.`);
  },
},

{
  code: 'DUEL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const allies = cell?.units?.filter((u: any) => u.player === pid && u.region === region && u.kind !== 'Avatar') || [];
    if (!allies.length) { pushLog(g, 'Duel: choose a tile with an allied minion.'); return; }
    let ally = allies[0];
    if (allies.length > 1) {
      const menu = allies.map((u: any, i: number) => `${i + 1}) ${u.name}`).join('\n');
      const ans = window.prompt(`Duel — choose your champion:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > allies.length) { pushLog(g, 'Duel cancelled.'); return; }
      ally = allies[idx - 1];
    }
    const foes: any[] = [];
    for (let y = ally.y - 1; y <= ally.y + 1; y++) for (let x = ally.x - 1; x <= ally.x + 1; x++) {
      if (!insideBoard(g, x, y) || (x === ally.x && y === ally.y)) continue;
      foes.push(...unitsAtTileInRegion(g, x, y, ally.region).filter((u: any) => u.player !== pid && u.kind !== 'Avatar'));
    }
    if (!foes.length) { pushLog(g, 'Duel: no adjacent enemies.'); return; }
    let enemy = foes[0];
    if (foes.length > 1) {
      const menu = foes.map((u: any, i: number) => `${i + 1}) ${u.name}`).join('\n');
      const ans = window.prompt(`Duel — choose the opponent:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > foes.length) { pushLog(g, 'Duel cancelled.'); return; }
      enemy = foes[idx - 1];
    }
    const allyDamage = lethalAmountLocal(g, ally, enemy, ally.atk ?? ally.power ?? 0);
    const enemyDamage = lethalAmountLocal(g, enemy, ally, enemy.atk ?? enemy.power ?? 0);
    damage(g, enemy, allyDamage);
    damage(g, ally, enemyDamage);
    pushLog(g, `Duel — ${ally.name} and ${enemy.name} trade blows (${allyDamage}/${enemyDamage}).`);
  },
},

{
  code: 'TITHE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const drawn = _drawFromAtlas(g, pid, 3);
    if (drawn > 0) pushLog(g, `Tithe grants ${drawn} site card(s).`);
    else pushLog(g, 'Tithe finds no sites to draw.');
  },
},

{
  code: 'VANISHMENT',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    let count = 0;
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      for (const unit of cell.units || []) {
        if (unit.player === pid && unit.kind !== 'Avatar') {
          if (_canGainStealth(unit)) {
            unit.stealth = true;
            count++;
          }
        }
      }
    }
    const drawn = _drawFromSpellbook(g, pid, 1);
    pushLog(g, `Vanishment cloaks ${count} allied minion(s) and draws ${drawn} card(s).`);
  },
},

{
  code: 'RESCUE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const cemetery = g.cemetery?.[pid] || [];
    const units = cemetery.filter((c: any) => c.kind === 'Unit');
    if (!units.length) { pushLog(g, 'Rescue: no minions in your cemetery.'); return; }
    let pick = units[0];
    if (units.length > 1) {
      const menu = units.map((c: any, i: number) => `${i + 1}) ${c.name}`).join('\n');
      const ans = window.prompt(`Rescue — choose a minion to return:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > units.length) { pushLog(g, 'Rescue cancelled.'); return; }
      pick = units[idx - 1];
    }
    const index = cemetery.findIndex((c: any) => c.id === pick.id);
    if (index >= 0) cemetery.splice(index, 1);
    const hand = g.handSpells?.[pid] ?? (g.handSpells[pid] = []);
    hand.push(pick);
    pushLog(g, `Rescue returns ${pick.name} to your hand.`);
  },
},

{
  code: 'MESMERISM',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Mesmerism fizzles — no caster found.'); return; }
    const region = g.viewRegion;
    const unit = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.kind !== 'Avatar');
    if (!unit) { pushLog(g, 'Mesmerism: target a minion.'); return; }
    if (_chebyshev(caster.x, caster.y, unit.x, unit.y) > 1) { pushLog(g, 'Mesmerism: target must be nearby.'); return; }
    unit.player = pid;
    unit.tapped = true;
    if (_canGainStealth(unit)) {
      unit.stealth = true;
    } else {
      pushLog(g, `${unit.name} cannot gain Stealth (suppressed).`);
    }
    pushLog(g, `${unit.name} is mesmerized into your service.`);
  },
},

{
  code: 'SHRINK',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Shrink fizzles — no caster found.'); return; }
    const region = g.viewRegion;
    const target = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.kind !== 'Avatar');
    if (!target) { pushLog(g, 'Shrink: target a minion.'); return; }
    if (_chebyshev(caster.x, caster.y, target.x, target.y) > 1) { pushLog(g, 'Shrink: target must be nearby.'); return; }

    const effect = (target as any)._shrinkEffect ?? {};
    if (effect.originalPower === undefined) effect.originalPower = typeof target.power === 'number' ? target.power : null;
    if (effect.originalAtk === undefined) effect.originalAtk = typeof target.atk === 'number' ? target.atk : null;
    effect.ownerPid = pid;
    effect.restoreTurn = (g.turnNumber ?? 0) + 2;
    (target as any)._shrinkEffect = effect;

    target.power = 0;
    if (typeof target.atk === 'number') target.atk = 0;

    pushLog(g, `${target.name} is shrunk down until your next turn.`);
  },
},

{
  code: 'LED_ASTRAY',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const enemies = cell.units?.filter((u: any) => u.player !== pid && u.region === region && u.kind !== 'Avatar') || [];
    if (!enemies.length) { pushLog(g, 'Led Astray: choose enemies at a location.'); return; }
    const dirRaw = window.prompt('Led Astray — direction (N,S,E,W)?', 'N');
    if (!dirRaw) { pushLog(g, 'Led Astray cancelled.'); return; }
    const map: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const delta = map[dirRaw.trim().toUpperCase()];
    if (!delta) { pushLog(g, 'Led Astray: invalid direction.'); return; }
    const destX = params.x + delta[0];
    const destY = params.y + delta[1];
    if (!insideBoard(g, destX, destY)) { pushLog(g, 'Led Astray: destination outside the board.'); return; }
    const dest = cellOfBoard(g, destX, destY);
    let moved = 0;
    for (const enemy of enemies) {
      if (_regionAllowedForUnitAtCell(enemy, enemy.region, dest)) {
        _moveUnitTo(g, enemy, destX, destY, enemy.region);
        moved++;
      }
    }
    pushLog(g, `Led Astray misguides ${moved} enemy unit(s).`);
  },
},

{
  code: 'DEGRADATION',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const region = g.viewRegion;
    const unit = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.kind !== 'Avatar');
    if (!unit) { pushLog(g, 'Degradation: target a minion.'); return; }
    if (!_isMortalUnit(unit)) { pushLog(g, 'Degradation only affects Mortal units.'); return; }
    unit.name = 'Foot Soldier';
    unit.element = 'Earth';
    unit.power = 1;
    unit.atk = 1;
    unit.def = 1;
    unit.stealth = false;
    unit.airborne = false;
    unit.subTypes = ['Soldier', 'Mortal'];
    unit.image = '/assets/Foot_Soldier.png';
    pushLog(g, `Degradation reduces the target to a Foot Soldier.`);
  },
},

{
  code: 'CAST_INTO_EXILE',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell.site || cell.site.controller !== pid) { pushLog(g, 'Cast into Exile: target a site you control.'); return; }
    const units = cell.units?.filter((u: any) => u.kind !== 'Avatar') || [];
    if (!units.length) { pushLog(g, 'Cast into Exile: no minions present.'); return; }
    let target = units[0];
    if (units.length > 1) {
      const menu = units.map((u: any, i: number) => `${i + 1}) ${u.name} (P${u.player})`).join('\n');
      const ans = window.prompt(`Cast into Exile — choose a minion:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > units.length) { pushLog(g, 'Cast into Exile cancelled.'); return; }
      target = units[idx - 1];
    }
    for (const artId of target.carrying ?? []) {
      const art = (g.artifacts || []).find((a: any) => a.id === artId);
      if (art) {
        art.carriedBy = null;
        art.x = target.x;
        art.y = target.y;
        art.region = target.region;
        (cell.artifacts ??= []).push(art);
      }
    }
    target.carrying = [];
    _clearMultiTileIndex(g, target);
    cell.units = (cell.units || []).filter((u: any) => u.id !== target.id);
    const owner = target.player as number;
    const original = (target as any)._srcCard ? _cloneDeep((target as any)._srcCard) : {
      id: _rngId(),
      kind: 'Unit',
      name: target.name,
      element: target.element,
      cost: (target as any).cost ?? 0,
      threshold: (target as any).threshold ?? {},
      power: target.power ?? target.atk ?? 0,
      atk: target.atk,
      def: target.def,
      rarity: (target as any).rarity ?? 'Ordinary',
      subTypes: (target as any).subTypes ?? [],
    };
    const deck = g.decks?.[owner]?.spellbook ?? (g.decks[owner].spellbook = []);
    deck.push(original);
    _shuffleInPlace(deck);
    pushLog(g, `Cast into Exile shuffles ${original.name} into Player ${owner}'s spellbook.`);
  },
},

{
  code: 'GUARDS',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const av = g.avatars?.[pid];
    if (!av) { pushLog(g, 'Guards! fizzles — avatar not found.'); return; }
    let spawned = 0;
    for (let y = av.y - 1; y <= av.y + 1; y++) for (let x = av.x - 1; x <= av.x + 1; x++) {
      if (!insideBoard(g, x, y)) continue;
      const cell = cellOfBoard(g, x, y);
      if (!cell.site) continue;
      const token = {
        id: _rngId(),
        kind: 'Token' as const,
        name: 'Foot Soldier',
        element: 'Earth',
        player: pid,
        x, y,
        region: 'surface' as const,
        tapped: false,
        power: 1,
        atk: 1,
        def: 1,
        carrying: [] as string[],
        summonedThisTurn: true,
        damage: 0,
        image: '/assets/Foot_Soldier.png',
      };
      (cell.units ??= []).push(token);
      spawned++;
    }
    pushLog(g, `Guards! summons ${spawned} Foot Soldier token(s).`);
  },
},

{
  code: 'MAD_DASH',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    _drawFromSpellbook(g, pid, 1);
    const region = g.viewRegion;
    const unit = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.player === pid && u.kind !== 'Avatar');
    if (!unit) { pushLog(g, 'Mad Dash: target an allied minion.'); return; }
    unit.movementPlus = (unit.movementPlus ?? 0) + 1;
    (unit as any)._madDashBonus = ((unit as any)._madDashBonus ?? 0) + 1;
    (unit as any)._madDashTurn = g.turn;
    pushLog(g, `${unit.name} gets a burst of speed and cannot be intercepted this turn.`);
  },
},

{
  code: 'STAR_SEEDS_OF_UHR',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const empties: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      if (!cell.site) empties.push({ x, y });
    }
    if (!empties.length) { pushLog(g, 'Star-seeds of Uhr — no voids to fill.'); return; }
    let filled = 0;
    for (const pos of empties.slice(0, 13)) {
      const cell = cellOfBoard(g, pos.x, pos.y);
      cell.site = {
        id: _rngId(),
        type: 'Site',
        name: 'Rubble',
        controller: null,
        elements: [],
        isWater: false,
        rubble: true,
        justPlaced: true,
        image: '/assets/Rubble.png',
      };
      filled++;
    }
    pushLog(g, `Star-seeds of Uhr creates ${filled} Rubble site(s).`);
  },
},

{
  code: 'UNRAVEL',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Unravel fizzles — no caster found.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 2) { pushLog(g, 'Unravel: target out of range (2).'); return; }
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    let minions = 0;
    for (const unit of unitsAtTileInRegion(g, params.x, params.y, region)) {
      if (_isDemonOrUndead(unit)) {
        const prev = (unit as any)._banishOnDeath;
        (unit as any)._banishOnDeath = true;
        damage(g, unit, unitThresholdHPPlus(g, unit) + 999);
        const still = cell.units?.some((u: any) => u.id === unit.id);
        if (still) {
          if (prev === undefined) delete (unit as any)._banishOnDeath;
          else (unit as any)._banishOnDeath = prev;
        } else minions++;
      }
    }
    let artifacts = 0;
    cell.artifacts = (cell.artifacts || []).filter((art: any) => {
      const isUndeadArt = _unitHasSubtype(art, 'Undead') || /undead/i.test(String(art.name ?? ''));
      if (isUndeadArt) { artifacts++; return false; }
      return true;
    });
    pushLog(g, `Unravel obliterates ${minions} minion(s) and ${artifacts} artifact(s).`);
  },
},

{
  code: 'SHATTER_STRIKE',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const region = g.viewRegion;
    const cell = cellOfBoard(g, params.x, params.y);
    const enemies = cell.units?.filter((u: any) => u.player !== pid && u.region === region && u.kind !== 'Avatar') || [];
    if (!enemies.length) { pushLog(g, 'Shatter Strike: no enemies here.'); return; }
    let enemy = enemies[0];
    if (enemies.length > 1) {
      const menu = enemies.map((u: any, i: number) => `${i + 1}) ${u.name}`).join('\n');
      const ans = window.prompt(`Shatter Strike — pick an enemy:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > enemies.length) { pushLog(g, 'Shatter Strike cancelled.'); return; }
      enemy = enemies[idx - 1];
    }
    const adjAllies: any[] = [];
    for (let y = enemy.y - 1; y <= enemy.y + 1; y++) for (let x = enemy.x - 1; x <= enemy.x + 1; x++) {
      if (!insideBoard(g, x, y)) continue;
      adjAllies.push(...unitsAtTileInRegion(g, x, y, enemy.region).filter((u: any) => u.player === pid && u.kind !== 'Avatar'));
    }
    if (!adjAllies.length) { pushLog(g, 'Shatter Strike: no adjacent allies.'); return; }
    let attacker = adjAllies[0];
    if (adjAllies.length > 1) {
      const menu = adjAllies.map((u: any, i: number) => `${i + 1}) ${u.name}`).join('\n');
      const ans = window.prompt(`Shatter Strike — choose the attacker:\n${menu}\n0 = cancel`, '1');
      const idx = ans ? parseInt(ans, 10) : 0;
      if (!Number.isFinite(idx) || idx <= 0 || idx > adjAllies.length) { pushLog(g, 'Shatter Strike cancelled.'); return; }
      attacker = adjAllies[idx - 1];
    }
    if ((enemy.carrying ?? []).length > 0) {
      const artId = enemy.carrying!.shift();
      if (artId) {
        const art = (g.artifacts || []).find((a: any) => a.id === artId);
        if (art) {
          art.carriedBy = null;
          art.x = enemy.x;
          art.y = enemy.y;
          art.region = enemy.region;
          (cell.artifacts ??= []).push(art);
          pushLog(g, `${attacker.name} shatters ${art.name}.`);
        }
      }
    } else {
      pushLog(g, `${enemy.name} carried no artifact to shatter.`);
    }
    const dmg = lethalAmountLocal(g, attacker, enemy, attacker.atk ?? attacker.power ?? 0);
    damage(g, enemy, dmg);
    pushLog(g, `Shatter Strike deals ${dmg >= 999 ? 'lethal damage' : dmg} to ${enemy.name}.`);
  },
},

{
  code: 'ARCANE_BARRAGE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Arcane Barrage fizzles — no caster found.'); return; }
    const dirRaw = window.prompt('Arcane Barrage direction (N, S, E, W)?', 'N');
    if (!dirRaw) { pushLog(g, 'Arcane Barrage cancelled.'); return; }
    const map: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const delta = map[dirRaw.trim().toUpperCase()];
    if (!delta) { pushLog(g, 'Arcane Barrage: invalid direction.'); return; }
    const shotsRaw = window.prompt('Arcane Barrage — number of projectiles?', '3');
    const shots = shotsRaw ? Math.max(1, Math.min(10, parseInt(shotsRaw, 10) || 0)) : 0;
    if (shots <= 0) { pushLog(g, 'Arcane Barrage cancelled.'); return; }
    for (let i = 0; i < shots; i++) {
      let x = caster.x;
      let y = caster.y;
      while (insideBoard(g, x + delta[0], y + delta[1])) {
        x += delta[0];
        y += delta[1];
        const list = unitsAtTileInRegion(g, x, y, caster.region ?? 'surface');
        if (list.length) {
          const victim = list.find((u: any) => u.player !== pid) || list[0];
          damage(g, victim, lethalAmountLocal(g, caster, victim, 1), { sourceElement: 'Arcane' });
          pushLog(g, `Arcane Barrage hits ${victim.name} for 1.`);
          break;
        }
      }
    }
  },
},

{
  code: 'MAGIC_MISSILES',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Magic Missiles fizzles — no caster found.'); return; }
    const dirRaw = window.prompt('Magic Missiles direction (N, S, E, W)?', 'N');
    if (!dirRaw) { pushLog(g, 'Magic Missiles cancelled.'); return; }
    const map: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const delta = map[dirRaw.trim().toUpperCase()];
    if (!delta) { pushLog(g, 'Magic Missiles: invalid direction.'); return; }
    for (let i = 0; i < 3; i++) {
      let x = caster.x;
      let y = caster.y;
      while (insideBoard(g, x + delta[0], y + delta[1])) {
        x += delta[0];
        y += delta[1];
        const list = unitsAtTileInRegion(g, x, y, caster.region ?? 'surface');
        if (list.length) {
          const victim = list.find((u: any) => u.player !== pid) || list[0];
          damage(g, victim, lethalAmountLocal(g, caster, victim, 1), { sourceElement: 'Arcane' });
          pushLog(g, `Magic Missiles zaps ${victim.name} for 1.`);
          break;
        }
      }
    }
  },
},

{
  code: 'PEASANT_REVOLT',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    let removed = 0;
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      const nextUnits: any[] = [];
      for (const unit of cell.units || []) {
        if (unit.kind === 'Avatar') { nextUnits.push(unit); continue; }
        const rarity = unit.rarity ?? unit._srcCard?.rarity;
        const elite = typeof rarity === 'string' && /^(unique|elite)$/i.test(rarity);
        if (elite) {
          removed++;
          _clearMultiTileIndex(g, unit);
        } else {
          nextUnits.push(unit);
        }
      }
      cell.units = nextUnits;
      cell.artifacts = (cell.artifacts || []).filter((a: any) => {
        const rarity = a.rarity;
        const elite = typeof rarity === 'string' && /^(unique|elite)$/i.test(rarity);
        if (elite) removed++;
        return !elite;
      });
    }
    pushLog(g, `Peasant Revolt destroys ${removed} elite permanents.`);
  },
},

{
  code: 'POLLIMORPH',
  targeting: 'click-unit',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Pollimorph fizzles — no caster found.'); return; }
    const region = g.viewRegion;
    const unit = unitsAtTileInRegion(g, params.x, params.y, region).find((u: any) => u.kind !== 'Avatar');
    if (!unit) { pushLog(g, 'Pollimorph: target a minion.'); return; }
    if (_chebyshev(caster.x, caster.y, unit.x, unit.y) > 1) { pushLog(g, 'Pollimorph: target must be nearby.'); return; }
    const cell = cellOfBoard(g, unit.x, unit.y);
    for (const artId of unit.carrying ?? []) {
      const art = (g.artifacts || []).find((a: any) => a.id === artId);
      if (art) {
        art.carriedBy = null;
        art.x = unit.x;
        art.y = unit.y;
        art.region = unit.region;
        (cell.artifacts ??= []).push(art);
      }
    }
    unit.carrying = [];
    _clearMultiTileIndex(g, unit);
    cell.units = (cell.units || []).filter((u: any) => u.id !== unit.id);
    const frog = {
      id: _rngId(),
      kind: 'Token' as const,
      name: 'Frog',
      element: 'Water',
      player: unit.player,
      x: unit.x,
      y: unit.y,
      region: 'surface' as const,
      tapped: false,
      power: 1,
      atk: 1,
      def: 1,
      carrying: [] as string[],
      summonedThisTurn: true,
      damage: 0,
      image: '/assets/Frog.png',
    };
    (cell.units ??= []).push(frog);
    pushLog(g, `${unit.name} is turned into a Frog.`);
  },
},

{
  code: 'STORMY_SEAS',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell?.site || !cell.site.isWater) { pushLog(g, 'Stormy Seas requires a water site.'); return; }
    let moved = 0;
    let drowned = 0;
    for (const unit of [...(cell.units || [])]) {
      if (unit.kind === 'Avatar') continue;
      if (unit.region === 'underwater') continue;
      if (forceSubmergeUnitLocal(g, unit, params.x, params.y, cell, `${unit.name} cannot survive underwater and drowns.`)) {
        moved++;
      } else {
        drowned++;
      }
    }
    for (const art of cell.artifacts || []) {
      if (!art.carriedBy && art.region !== 'underwater') {
        art.region = 'underwater';
        moved++;
      }
    }
    const detail = drowned > 0
      ? `submerges ${moved} permanent(s) and drowns ${drowned} minion(s)`
      : `submerges ${moved} permanents`;
    pushLog(g, `Stormy Seas ${detail}.`);
  },
},

{
  code: 'FONT_OF_LIFE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const processed = new Set<string>();
    const entries: string[] = [];
    let totalHealed = 0;

    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const cell = cellOfBoard(g, x, y);
        for (const unit of cell.units || []) {
          if (unit.player !== pid) continue;
          const unitId = (unit as any).id ?? `AVATAR-${unit.player}`;
          if (processed.has(unitId)) continue;
          processed.add(unitId);

          const ux = unit.x;
          const uy = unit.y;
          const region = (unit.region ?? 'surface') as string;
          if (!Number.isFinite(ux) || !Number.isFinite(uy)) continue;
          if (region !== 'surface' && region !== 'underwater') continue;

          const amount = _countWaterBodySitesLocal(g, ux, uy);
          if (amount <= 0) continue;

          if (unit.kind === 'Avatar') {
            const healed = _healAvatarLifeLocal(g, unit.player, amount);
            if (healed > 0) {
              totalHealed += healed;
              entries.push(`${unit.name} (+${healed})`);
            }
          } else {
            const healed = _healTokenDamageLocal(unit, amount);
            if (healed > 0) {
              totalHealed += healed;
              entries.push(`${unit.name} (+${healed})`);
            }
          }
        }
      }
    }

    const helpers = getSpellHostHelpers();
    const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;

    if (totalHealed > 0) {
      const allyCount = entries.length;
      const summary =
        allyCount === 0
          ? ''
          : allyCount <= 3
            ? ` (${entries.join(', ')})`
            : ` (${allyCount} allies)`;
      pushLog(g, `Font of Life restores ${totalHealed} life to your ranks${summary}.`);
      if (requestSync) requestSync();
    } else {
      pushLog(g, 'Font of Life finds no wounded allies within the waters.');
    }
  },
},

{
  code: 'TWIST_OF_FATE',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Twist of Fate fizzles — no caster found.'); return; }
    const opponent = pid === 1 ? 2 : 1;
    const mine = g.avatars?.[pid];
    const foe = g.avatars?.[opponent];
    if (!mine || !foe) { pushLog(g, 'Twist of Fate requires both avatars.'); return; }
    const myLife = Math.max(0, mine.life ?? 0);
    const oppLife = Math.max(0, foe.life ?? 0);
    const diff = Math.abs(myLife - oppLife);

    mine.life = oppLife;
    foe.life = myLife;

    if (mine.life > 0) {
      mine.deathsDoor = false;
      delete (mine as any)._deathDoorTurn;
      if (g.protectedDD) g.protectedDD[pid] = false;
    } else {
      mine.deathsDoor = true;
      if (g.protectedDD) g.protectedDD[pid] = true;
      (mine as any)._deathDoorTurn = g.turnNumber;
    }

    if (foe.life > 0) {
      foe.deathsDoor = false;
      delete (foe as any)._deathDoorTurn;
      if (g.protectedDD) g.protectedDD[opponent] = false;
    } else {
      foe.deathsDoor = true;
      if (g.protectedDD) g.protectedDD[opponent] = true;
      (foe as any)._deathDoorTurn = g.turnNumber;
    }

    pushLog(g, `Twist of Fate exchanges life totals — (X) = ${diff}.`);
  },
},

{
  code: 'UPWELLING',
  targeting: 'click-tile',
  resolve(ctx, params) {
    if (params.kind !== 'click') return;
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Upwelling fizzles — no caster found.'); return; }
    if (_chebyshev(caster.x, caster.y, params.x, params.y) > 1) {
      pushLog(g, 'Upwelling: target must be a nearby site.');
      return;
    }
    const cell = cellOfBoard(g, params.x, params.y);
    if (!cell?.site || cell.site.rubble) {
      pushLog(g, 'Upwelling: choose a standing site.');
      return;
    }

    const targetUnits: any[] = [];
    for (const unit of cell.units || []) {
      if (unit.kind === 'Avatar') continue;
      if (unit.x !== params.x || unit.y !== params.y) continue;
      const region = unit.region ?? 'surface';
      if (region !== 'surface' && region !== 'underwater') continue;
      targetUnits.push(unit);
    }

    let returnedUnits = 0;
    for (const unit of [...targetUnits]) {
      if (returnUnitToHandLocal(g, unit)) returnedUnits++;
    }

    const artifactsAfter = cell.artifacts || [];
    let returnedArtifacts = 0;
    for (const art of [...artifactsAfter]) {
      if (art?.carriedBy) continue;
      if (returnArtifactToHandLocal(g, art)) returnedArtifacts++;
    }

    if (returnedUnits === 0 && returnedArtifacts === 0) {
      pushLog(g, 'Upwelling finds nothing to return.');
    } else {
      pushLog(g, `Upwelling returns ${returnedUnits} minion(s) and ${returnedArtifacts} artifact(s) to their owners' hands.`);
    }
  },
},

{
  code: 'WRATH_OF_THE_SEA',
  targeting: 'none',
  resolve(ctx) {
    const g: any = ctx.state;
    const pid: any = ctx.pid;
    const caster = findCaster(g, pid);
    if (!caster) { pushLog(g, 'Wrath of the Sea fizzles — no caster found.'); return; }

    const waterTiles = new Set<string>();
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      const site = cell?.site;
      if (!site || site.rubble) continue;
      if (isSiteWaterLocal(g, site, x, y)) waterTiles.add(`${x},${y}`);
    }

    const flooded = new Set<string>();
    const directions: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const key of Array.from(waterTiles)) {
      const [sx, sy] = key.split(',').map((n) => parseInt(n, 10));
      for (const [dx, dy] of directions) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (!insideBoard(g, nx, ny)) continue;
        const cell = cellOfBoard(g, nx, ny);
        const site = cell?.site;
        if (!site || site.rubble) continue;
        if (isSiteWaterLocal(g, site, nx, ny)) continue;
        const key2 = `${nx},${ny}`;
        if (flooded.has(key2)) continue;
        if (!site.floodplainTemp) {
          site.floodplainTemp = {
            prevIsWater: !!site.isWater,
            prevFloodedByPid: site.floodedByPid ?? null,
            turnNumber: g.turnNumber,
          };
        } else {
          site.floodplainTemp.prevIsWater = site.floodplainTemp.prevIsWater ?? !!site.isWater;
          site.floodplainTemp.prevFloodedByPid = site.floodplainTemp.prevFloodedByPid ?? site.floodedByPid ?? null;
          site.floodplainTemp.turnNumber = g.turnNumber;
        }
        site.isWater = true;
        site.floodedByPid = pid;
        site.justPlaced = true;
        flooded.add(key2);
      }
    }

    let submerged = 0;
    let drowned = 0;
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const cell = cellOfBoard(g, x, y);
      const site = cell?.site;
      if (!site || site.rubble) continue;
      if (!isSiteWaterLocal(g, site, x, y)) continue;
      for (const unit of [...(cell.units || [])]) {
        if (unit.kind === 'Avatar') continue;
        if (unit.region === 'underwater') continue;
        if (forceSubmergeUnitLocal(g, unit, x, y, cell, `${unit.name} cannot survive underwater and drowns.`)) {
          submerged++;
        } else {
          drowned++;
        }
      }
      for (const art of cell.artifacts || []) {
        if (art?.carriedBy) continue;
        if (art.region !== 'underwater') {
          art.region = 'underwater';
          submerged++;
        }
      }
    }

    const summaryParts: string[] = [`floods ${flooded.size} site(s)`];
    summaryParts.push(`submerges ${submerged} permanent(s)`);
    if (drowned > 0) summaryParts.push(`drowns ${drowned} minion(s)`);
    pushLog(g, `Wrath of the Sea ${summaryParts.join(' and ')}.`);
  }
  },
  {
    code: 'GEYSER',
    targeting: 'click-tile',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Geyser fizzles — no caster found.'); return; }
      const cell = cellOfBoard(g, params.x, params.y);
      const site = cell?.site;
      if (!site || site.rubble) {
        pushLog(g, 'Geyser requires a standing site.');
        return;
      }

      site.floodplainTemp = {
        prevIsWater: !!site.isWater,
        prevFloodedByPid: site.floodedByPid ?? null,
        turnNumber: g.turnNumber,
      };
      site.isWater = true;
      site.floodedByPid = pid;

      let airborne = 0;
      for (const unit of cell.units || []) {
        if (unit.kind === 'Avatar') continue;
        if (unit.player !== pid) continue;
        if ((unit.region ?? 'surface') !== 'surface') continue;
        if (!unit.airborne) {
          unit.airborne = true;
          airborne++;
        }
      }

      const drawn = _drawFromSpellbook(g, pid, 1);
      const siteLabel = `(${params.x + 1}, ${params.y + 1})`;
      const airborneText = airborne > 0
        ? `${airborne} allied minion${airborne === 1 ? '' : 's'} gain Airborne.`
        : 'No allied minions were present to gain Airborne.';
      const drawText = drawn > 0 ? 'You draw a card.' : 'Your spellbook is empty.';
      pushLog(g, `Geyser floods ${siteLabel} for the turn. ${airborneText} ${drawText}`);

      const helpers = getSpellHostHelpers();
      const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;
      if (requestSync) requestSync();
    },
  },

  {
    code: 'MARINE_VOYAGE',
    targeting: 'click-tile',
    resolve(ctx, params) {
      if (params.kind !== 'click') return;
      const g: any = ctx.state;
      const pid: any = ctx.pid;
      const caster = findCaster(g, pid);
      if (!caster) { pushLog(g, 'Marine Voyage fizzles — no caster found.'); return; }

      if (params.x < 0 || params.y < 0 || params.x >= g.width || params.y >= g.height) {
        pushLog(g, 'Marine Voyage: target within the realm.');
        return;
      }

      const startCell = cellOfBoard(g, params.x, params.y);
      if (!startCell?.site || !isSiteWaterLocal(g, startCell.site, params.x, params.y)) {
        pushLog(g, 'Marine Voyage must target a site within a body of water.');
        return;
      }

      const key = (x: number, y: number) => `${x},${y}`;
      const visited = new Set<string>();
      const queue: Array<{ x: number; y: number }> = [{ x: params.x, y: params.y }];

      while (queue.length > 0) {
        const cur = queue.shift()!;
        const k = key(cur.x, cur.y);
        if (visited.has(k)) continue;
        const cell = cellOfBoard(g, cur.x, cur.y);
        const site = cell?.site;
        if (!site || !isSiteWaterLocal(g, site, cur.x, cur.y)) continue;
        visited.add(k);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as Array<[number, number]>) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (!insideBoard(g, nx, ny)) continue;
          queue.push({ x: nx, y: ny });
        }
      }

      if (visited.size === 0) {
        pushLog(g, 'Marine Voyage finds no continuous body of water.');
        return;
      }

      const tiles = Array.from(visited).map((k) => {
        const [sx, sy] = k.split(',').map(Number);
        return { x: sx, y: sy };
      });

      const storeRaw = (g as any)._marineVoyageEffects as Array<{ pid: any; tiles: Array<{ x: number; y: number }>; turnNumber: number }> | undefined;
      const filtered = Array.isArray(storeRaw)
        ? storeRaw.filter(entry => entry && entry.turnNumber === g.turnNumber)
        : [];
      (g as any)._marineVoyageEffects = filtered.filter(entry => entry.pid !== pid);
      (g as any)._marineVoyageEffects.push({ pid, tiles, turnNumber: g.turnNumber });

      const helpers = getSpellHostHelpers();
      const requestSync = typeof helpers?.requestGameSync === 'function' ? helpers.requestGameSync : null;
      if (requestSync) requestSync();

      pushLog(g, `Marine Voyage charts ${tiles.length} water site(s). Your units treat them as adjacent for movement this turn.`);
    },
  },

]);
