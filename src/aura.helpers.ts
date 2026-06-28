type PlayerId = 1 | 2

type AuraSourceEntry = {
  owner: PlayerId
  card: any
}

const STORAGE_KEY = '_pendingAuraCards'

const ensureStorage = (g: any): Record<string, AuraSourceEntry> => {
  if (!g[STORAGE_KEY]) {
    g[STORAGE_KEY] = Object.create(null) as Record<string, AuraSourceEntry>
  }
  return g[STORAGE_KEY]
}

export function trackAuraSourceCard(g: any, aura: { id?: string }, owner: PlayerId, card: any): void {
  if (!aura?.id) return
  const store = ensureStorage(g)
  store[aura.id] = { owner, card: structuredClone(card) }
}

export function releaseAuraSourceCard(g: any, aura: { id?: string }): void {
  if (!aura?.id) return
  const store = g[STORAGE_KEY] as Record<string, AuraSourceEntry> | undefined
  if (!store) return
  const entry = store[aura.id]
  if (!entry) return
  const { owner, card } = entry
  if (g.cemetery && g.cemetery[owner]) {
    g.cemetery[owner].push(structuredClone(card))
  }
  delete store[aura.id]
  if (Object.keys(store).length === 0) delete g[STORAGE_KEY]
}

export function hasTrackedAuraSource(g: any, aura: { id?: string }): boolean {
  if (!aura?.id) return false
  const store = g[STORAGE_KEY] as Record<string, AuraSourceEntry> | undefined
  return !!store && aura.id in store
}

export function extractAuraSourceCard(g: any, aura: { id?: string }): { owner: PlayerId; card: any } | null {
  if (!aura?.id) return null
  const store = g[STORAGE_KEY] as Record<string, AuraSourceEntry> | undefined
  if (!store) return null
  const entry = store[aura.id]
  if (!entry) return null
  delete store[aura.id]
  if (Object.keys(store).length === 0) delete g[STORAGE_KEY]
  return { owner: entry.owner, card: structuredClone(entry.card) }
}
