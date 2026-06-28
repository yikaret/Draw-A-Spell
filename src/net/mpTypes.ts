export type MpRole = 'host' | 'join' | 'spectator'

// Identifies which entity's menu was opened so the host can rebuild the same action list.
export type MpMenuRef =
  | { kind: 'avatar'; pid: 1 | 2 }
  | { kind: 'unit'; unitId: string }
  | { kind: 'site'; x: number; y: number }
  | { kind: 'artifact'; artifactId: string }

export type MpGmZone = 'deck' | 'hand' | 'cemetery' | 'banished' | 'realm'

export type MpGmRealmTarget =
  | { kind: 'avatar'; pid: 1 | 2 }
  | { kind: 'unit'; unitId: string }
  | { kind: 'site'; x: number; y: number }
  | { kind: 'artifact'; artifactId: string }

export type MpGmAction =
  | {
      kind: 'zoneCard'
      pid: 1 | 2
      dest: Exclude<MpGmZone, 'realm'>
      source:
        | { zone: 'pool'; cardName: string }
        | { zone: Exclude<MpGmZone, 'realm'>; pid: 1 | 2; cardId: string }
    }
  | {
      kind: 'startPlacement'
      pid: 1 | 2
      cardName: string
      source?: { zone: Exclude<MpGmZone, 'realm'>; pid: 1 | 2; cardId: string }
    }
  | { kind: 'resolvePlacement'; x: number; y: number }
  | { kind: 'cancelPlacement' }
  | { kind: 'quickPlace'; pid: 1 | 2; cardName: string; x: number; y: number }
  | { kind: 'moveRealmObject'; pid: 1 | 2; target: MpGmRealmTarget; dest: Exclude<MpGmZone, 'realm'> }
  | { kind: 'dealFromDeck'; pid: 1 | 2; deck: 'atlas' | 'spellbook' }
  | { kind: 'loadPrecon'; pid: 1 | 2; preconName: string }
  | { kind: 'setRulesActive'; rulesActive: boolean }
  | { kind: 'adjustAvatarLife'; pid: 1 | 2; delta: number }
  | { kind: 'adjustMana'; pid: 1 | 2; delta: number }

// Player action intent sent from join -> host (authoritative).
// Keep these stable; indices must match the host's action list for a given menu.
export type MpIntent =
  | { type: 'menuAction'; menu: MpMenuRef; index: number }
  | { type: 'endTurn' }
  | { type: 'avatar:emote'; text: string }
  | { type: 'notepad:add'; text: string }
  | { type: 'appeal:toggle'; enabled: boolean }
  | { type: 'appeal:resume' }
  | { type: 'gm:action'; action: MpGmAction }
  | { type: 'mulligan:toggle'; entryId: string }
  | { type: 'mulligan:complete'; mode: 'keep' | 'mulligan' }
  | { type: 'lookX:toggle'; cardId: string }
  | { type: 'lookX:move'; from: number; to: number }
  | { type: 'lookX:confirm'; placement: 'top' | 'bottom' }
  | { type: 'cemetery:summon'; pid: 1 | 2; cardId: string }
  | { type: 'cemetery:castSpell'; pid: 1 | 2; cardId: string }
  // optional convenience intents (used by some overlays)
  | {
      type: 'cellClick';
      x: number;
      y: number;
      moveIntent?: 'attack' | 'abstain';
      moveTargetUnitId?: string;
      moveRegion?: 'surface' | 'underground' | 'underwater' | 'void';
      clearPendingMoveOnly?: boolean;
    }
  | { type: 'handCardClick'; cardId: string }
  | { type: 'drawChoice'; deck: 'atlas' | 'spells' }
  | { type: 'scry:place'; cardId: string; dest: 'top' | 'bottom' }

export type MpSession = {
  role: MpRole
  wsUrl: string
  room: string | null
  localPid: 1 | 2
  peerPid: 1 | 2
  status: 'idle' | 'connecting' | 'lobby' | 'inGame' | 'error'
  peerConnected: boolean
  error?: string
}

// Lightweight setup wire: avoid sending the entire card library.
export type MpPlayerSetupWire = {
  avatarName: string
  handle?: string
  userId?: string
  atlasNames: string[]
  spellNames: string[]
  // Magician uses a 3rd "collection" pile.
  collectionNames?: string[]
}

export type RemoteModalWire = {
  id: string
  // Which player's UI should display this modal.
  pid: 1 | 2
  kind: 'single' | 'multi' | 'confirm' | 'alert' | 'prompt'
  title: string
  message?: string
  options?: Array<{ label: string; description?: string; disabled?: boolean }>
  allowCancel?: boolean
  cancelLabel?: string
  confirmLabel?: string
  acknowledgeLabel?: string
  defaultValue?: string
  placeholder?: string
  allowEmpty?: boolean
  // For multi
  initialSelected?: number[]
}

export type MpMessage =
  | { t: 'room:create'; room?: string }
  | { t: 'room:created'; room: string; seat: 'host' }
  | { t: 'room:join'; room: string }
  | { t: 'room:joined'; room: string; seat: 'join'; peers?: number }
  | { t: 'room:spectate'; room: string }
  | { t: 'room:spectating'; room: string; seat: 'spectator'; peers?: number }
  | { t: 'peer:joined' }
  | { t: 'peer:left' }
  | { t: 'spectator:joined'; room: string; spectators: number }
  | { t: 'spectator:left'; room: string; spectators: number }
  | { t: 'chat:join'; room: string }
  | { t: 'chat:joined'; room: string; peers?: number }
  | { t: 'chat:presence'; room: string; peers: number }
  | { t: 'chat:msg'; room: string; handle?: string; userId?: string; text: string; ts?: number }
  | { t: 'setup'; setup: MpPlayerSetupWire }
  | { t: 'match:start'; game: unknown }
  | { t: 'game:sync'; seq: number; game: unknown }
  | { t: 'spectator:start'; game: unknown }
  | { t: 'spectator:sync'; seq: number; game: unknown }
  | { t: 'intent'; intent: MpIntent }
  | { t: 'modal:req'; req: RemoteModalWire }
  | { t: 'modal:res'; id: string; value: unknown }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'err'; e: string }
