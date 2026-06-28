import React, { useMemo, useRef, useState } from 'react'
import styles from './CardInspectorBottomSheet.module.css'

export type InspectorAction = {
  id: string
  label: string
  disabled?: boolean
  title?: string
  onClick: () => void
}

type CardInspectorBottomSheetProps = {
  open: boolean
  title: string
  subtitle?: string
  image?: string | null
  costText?: string | null
  thresholdText?: string | null
  keywords?: string[]
  rulesText?: string | null
  actions: InspectorAction[]
  onClose: () => void
}

const GLOSSARY: Record<string, string> = {
  ranged: 'Tap this unit to shoot a projectile that stops after 1 step and strikes the hit unit.',
  stealth: 'Cannot be attacked while untapped unless the attacker has Stealth.',
  charge: 'Can move and attack on the turn it is summoned.',
  lethal: 'Any amount of damage this unit deals to another unit is enough to destroy it.',
  airborne: 'Occupies and moves through air; can only be hit by legal attacks from matching zones/effects.',
  submerge: 'Can move in underwater lanes when legal water sites are present.',
  burrowing: 'Can move in underground lanes when legal sites are present.',
  voidwalk: 'Can move through void lanes when legal destinations exist.',
  ward: 'Prevents the next effect that would remove this unit/site from play.',
}

function glossaryForKeyword(keyword: string): string | null {
  const key = keyword.trim().toLowerCase()
  const normalized = key.startsWith('ranged') ? 'ranged' : key
  return GLOSSARY[normalized] ?? null
}

function imageFallbacks(src?: string | null): string[] {
  if (!src) return []
  const raw = `${src}`.trim()
  if (!raw) return []
  const out: string[] = []
  const push = (v?: string) => {
    if (!v) return
    if (!out.includes(v)) out.push(v)
  }
  push(raw)
  if (/\.webp$/i.test(raw)) {
    push(raw.replace(/\.webp$/i, '.png'))
    push(raw.replace(/\.webp$/i, '.jpg'))
  }
  if (/\/assets\/Images\//.test(raw)) push(raw.replace('/assets/Images/', '/assets/images/'))
  return out
}

function onInspectorImageError(e: React.SyntheticEvent<HTMLImageElement>) {
  const rest = (e.currentTarget.dataset.fallbacks ?? '').split('|').filter(Boolean)
  const next = rest.shift()
  if (next) {
    e.currentTarget.dataset.fallbacks = rest.join('|')
    e.currentTarget.src = next
    return
  }
  e.currentTarget.style.display = 'none'
}

export function CardInspectorBottomSheet({
  open,
  title,
  subtitle,
  image,
  costText,
  thresholdText,
  keywords = [],
  rulesText,
  actions,
  onClose,
}: CardInspectorBottomSheetProps) {
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null)
  const [showArt, setShowArt] = useState(false)
  const longPressTimer = useRef<number | null>(null)

  const cleanKeywords = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const keyword of keywords) {
      const next = keyword.trim()
      if (!next) continue
      const lower = next.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      out.push(next)
    }
    return out
  }, [keywords])
  const imageSrcs = useMemo(() => imageFallbacks(image), [image])

  if (!open) return null

  const openKeyword = (keyword: string) => {
    const desc = glossaryForKeyword(keyword)
    if (!desc) return
    setActiveKeyword((prev) => (prev?.toLowerCase() === keyword.toLowerCase() ? null : keyword))
  }

  const onKeywordPressStart = (keyword: string) => {
    window.clearTimeout(longPressTimer.current ?? undefined)
    longPressTimer.current = window.setTimeout(() => {
      openKeyword(keyword)
    }, 420)
  }

  const onKeywordPressEnd = () => {
    window.clearTimeout(longPressTimer.current ?? undefined)
    longPressTimer.current = null
  }

  return (
    <div className={styles.sheet} role="dialog" aria-label="Card inspector">
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{title}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.metaRow}>
        {image ? (
          <button type="button" className={styles.thumbButton} onClick={() => setShowArt(true)}>
            <img
              src={imageSrcs[0] ?? image}
              data-fallbacks={imageSrcs.slice(1).join('|')}
              onError={onInspectorImageError}
              alt={title}
              className={styles.thumb}
            />
          </button>
        ) : (
          <div className={styles.thumbPlaceholder}>No Art</div>
        )}
        <div className={styles.stats}>
          <div><strong>Cost:</strong> {costText ?? '—'}</div>
          <div><strong>Threshold:</strong> {thresholdText ?? '—'}</div>
          <div><strong>Keywords:</strong> {cleanKeywords.length ? cleanKeywords.join(', ') : '—'}</div>
        </div>
      </div>

      {cleanKeywords.length > 0 && (
        <div className={styles.keywordWrap}>
          {cleanKeywords.map((keyword) => {
            const desc = glossaryForKeyword(keyword)
            return (
              <div key={keyword} className={styles.keywordChipWrap}>
                <button
                  type="button"
                  className={styles.keywordChip}
                  onClick={() => openKeyword(keyword)}
                  onPointerDown={() => onKeywordPressStart(keyword)}
                  onPointerUp={onKeywordPressEnd}
                  onPointerLeave={onKeywordPressEnd}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openKeyword(keyword)
                  }}
                >
                  {keyword}
                  {desc ? <span className={styles.infoDot}>i</span> : null}
                </button>
                {activeKeyword?.toLowerCase() === keyword.toLowerCase() && desc && (
                  <div className={styles.keywordPopover}>{desc}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.rulesText}>{rulesText?.trim() ? rulesText : 'No card text available.'}</div>

      <div className={styles.actions}>
        {actions.length === 0 ? (
          <div className={styles.noActions}>No actions available</div>
        ) : (
          actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="btn"
              disabled={action.disabled}
              title={action.title}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))
        )}
      </div>

      {showArt && image && (
        <div className={styles.artOverlay} onClick={() => setShowArt(false)}>
          <img
            className={styles.artImage}
            src={imageSrcs[0] ?? image}
            data-fallbacks={imageSrcs.slice(1).join('|')}
            onError={onInspectorImageError}
            alt={title}
          />
        </div>
      )}
    </div>
  )
}
