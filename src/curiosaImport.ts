// Curiosa deck import helpers.
//
// This module is intentionally defensive: Curiosa's response shapes can vary depending on
// whether you hit a public endpoint or a local dev proxy. We parse a few common patterns
// and fall back to heuristic extraction.

export class CuriosaImportError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'CuriosaImportError'
    this.code = code
  }
}

export type CuriosaDeckEntry = {
  name: string
  count: number
  // Optional hint; we can derive from card kind if missing.
  zone?: 'atlas' | 'spellbook' | 'collection'
  category?: 'Aura' | 'Artifact' | 'Minion' | 'Magic' | 'Site' | 'Collection'
}

export function parseCuriosaDeckId(input: string): string {
  const raw = input.trim()
  if (!raw) throw new CuriosaImportError('bad_id', 'Please enter a Curiosa deck id or URL.')

  // Try URL first.
  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)

    // Common: /decks/<id>
    const idx = parts.findIndex((p) => p.toLowerCase() === 'decks')
    if (idx >= 0 && idx + 1 < parts.length) {
      const id = parts[idx + 1]
      if (id && /^[A-Za-z0-9_-]+$/.test(id)) return id
    }

    // Fallback: last segment.
    const last = parts[parts.length - 1]
    if (last && /^[A-Za-z0-9_-]+$/.test(last)) return last
  } catch {
    // Not a URL; fall through.
  }

  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw
  throw new CuriosaImportError('bad_id', 'That does not look like a valid Curiosa deck id or URL.')
}

type FetchOpts = { proxyBase?: string; debug?: boolean }

export async function fetchCuriosaDeckJson(deckId: string, opts: FetchOpts = {}): Promise<any> {
  const base = (opts.proxyBase ?? '').replace(/\/$/, '')
  const root = base || 'https://curiosa.io'

  // A handful of best-guess endpoints. Curiosa may change these; users can configure a proxy.
  const trpcInputs = [
    // Common tRPC "json" input shape used by many apps.
    encodeURIComponent(JSON.stringify({ json: { id: deckId } })),
    encodeURIComponent(JSON.stringify({ id: deckId })),
  ]

  const candidates: string[] = [
    `${root}/api/decks/${deckId}`,
    `${root}/api/decks/${deckId}.json`,
    // tRPC guesses (will typically require a proxy to avoid CORS in dev)
    `${root}/api/trpc/deck.get?input=${trpcInputs[0]}`,
    `${root}/api/trpc/deck.get?input=${trpcInputs[1]}`,
    `${root}/api/trpc/decks.get?input=${trpcInputs[0]}`,
    `${root}/api/trpc/decks.byId?input=${trpcInputs[0]}`,
  ]

  let lastErr: any = null
  for (const url of candidates) {
    try {
      if (opts.debug) console.log('[CuriosaImport] fetch', url)
      const res = await fetch(url, { credentials: 'omit' })
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`)
        continue
      }

      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        return await res.json()
      }

      // Some endpoints may return JSON without proper content-type.
      const txt = await res.text()
      try {
        return JSON.parse(txt)
      } catch {
        lastErr = new Error('Non-JSON response')
        continue
      }
    } catch (err) {
      lastErr = err
      continue
    }
  }

  const hint = base
    ? `Curiosa import failed via proxy "${base}".`
    : `Curiosa import failed. If you see CORS errors, configure a dev proxy (see README / Vite proxy).`
  throw new CuriosaImportError('fetch_failed', `${hint}${lastErr ? ` (${String(lastErr)})` : ''}`)
}

function isObj(v: any): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function pickName(obj: any): string | null {
  if (!obj) return null
  if (typeof obj === 'string') return obj
  if (typeof obj.name === 'string') return obj.name
  if (typeof obj.cardName === 'string') return obj.cardName
  if (isObj(obj.card) && typeof obj.card.name === 'string') return obj.card.name
  if (isObj(obj.card) && typeof obj.card.cardName === 'string') return obj.card.cardName
  return null
}

function pickCount(obj: any): number | null {
  if (!obj) return null
  const candidates = ['count', 'qty', 'quantity', 'amount', 'copies', 'num']
  for (const k of candidates) {
    const v = (obj as any)[k]
    if (typeof v === 'number' && isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}

function inferCategoryFromContext(path: string): NonNullable<CuriosaDeckEntry['category']> {
  const p = path.toLowerCase()
  if (p.includes('site') || p.includes('atlas')) return 'Site'
  if (p.includes('collection')) return 'Collection'
  if (p.includes('aura')) return 'Aura'
  if (p.includes('artifact')) return 'Artifact'
  if (p.includes('minion')) return 'Minion'
  if (p.includes('magic') || p.includes('spell')) return 'Magic'
  return 'Magic'
}

function inferZoneFromCategory(cat: CuriosaDeckEntry['category']): CuriosaDeckEntry['zone'] | undefined {
  if (cat === 'Site') return 'atlas'
  if (cat === 'Collection') return 'collection'
  return 'spellbook'
}

export function extractCuriosaCategoryLists(
  raw: any
): Record<'Aura' | 'Artifact' | 'Minion' | 'Magic' | 'Site' | 'Collection', CuriosaDeckEntry[]> {
  const acc: Record<
    'Aura' | 'Artifact' | 'Minion' | 'Magic' | 'Site' | 'Collection',
    Map<string, CuriosaDeckEntry>
  > = {
    Aura: new Map(),
    Artifact: new Map(),
    Minion: new Map(),
    Magic: new Map(),
    Site: new Map(),
    Collection: new Map(),
  }

  const seen = new Set<any>()

  function add(cat: NonNullable<CuriosaDeckEntry['category']>, name: string, count: number) {
    const key = name.trim()
    if (!key) return
    const map = acc[cat]
    const prev = map.get(key)
    if (prev) {
      prev.count += count
    } else {
      map.set(key, { name: key, count, category: cat, zone: inferZoneFromCategory(cat) })
    }
  }

  function walk(node: any, path: string) {
    if (node == null) return
    if (typeof node !== 'object') return
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], `${path}[${i}]`)
      return
    }

    const name = pickName(node)
    const count = pickCount(node)
    if (name && count != null) {
      const cat = inferCategoryFromContext(path)
      add(cat, name, count)
    }

    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k)
    }
  }

  walk(raw, '')

  const toArr = (m: Map<string, CuriosaDeckEntry>) =>
    Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name))

  return {
    Aura: toArr(acc.Aura),
    Artifact: toArr(acc.Artifact),
    Minion: toArr(acc.Minion),
    Magic: toArr(acc.Magic),
    Site: toArr(acc.Site),
    Collection: toArr(acc.Collection),
  }
}

function findAvatarName(raw: any): string | null {
  const seen = new Set<any>()

  function walk(node: any): string | null {
    if (node == null) return null
    if (typeof node === 'string') return null
    if (typeof node !== 'object') return null
    if (seen.has(node)) return null
    seen.add(node)

    if (Array.isArray(node)) {
      for (const it of node) {
        const found = walk(it)
        if (found) return found
      }
      return null
    }

    for (const key of ['avatarName', 'avatar', 'avatar_name', 'commander']) {
      const v = (node as any)[key]
      if (typeof v === 'string') return v
      if (isObj(v) && typeof v.name === 'string') return v.name
    }

    for (const [k, v] of Object.entries(node)) {
      if (k.toLowerCase().includes('avatar')) {
        if (typeof v === 'string') return v
        if (isObj(v) && typeof v.name === 'string') return v.name
      }
      const found = walk(v)
      if (found) return found
    }

    return null
  }

  return walk(raw)
}

export function parseCuriosaDeckResponse(
  raw: any,
  deckId?: string
): { entries: CuriosaDeckEntry[]; avatarName: string | null } {
  // Try extracting categories; it's the most robust approach across unknown shapes.
  const lists = extractCuriosaCategoryLists(raw)
  const entries = [
    ...lists.Site,
    ...lists.Magic,
    ...lists.Aura,
    ...lists.Artifact,
    ...lists.Minion,
    ...lists.Collection,
  ].map(({ name, count, zone, category }) => ({ name, count, zone, category }))

  if (entries.length === 0) {
    const idNote = deckId ? ` for deck "${deckId}"` : ''
    throw new CuriosaImportError('parse_failed', `Could not parse Curiosa deck contents${idNote}.`)
  }

  const avatarName = findAvatarName(raw)
  return { entries, avatarName }
}
