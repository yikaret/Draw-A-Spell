import React, { useEffect, useRef } from 'react'

export type ImpactBurst = {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  kind?: 'impact' | 'site_play' | 'undead_summon' | 'unit_destroyed' | 'projectile'
  tileWidthPct?: number
  tileHeightPct?: number
  siteElements?: Array<'Air' | 'Earth' | 'Fire' | 'Water'>
  siteFxStyle?: 'earth' | 'water' | 'air' | 'fire' | 'multi' | 'neutral' | 'default'
  projectileStyle?: 'hook' | 'arrow' | 'fire' | 'lightning'
  projectileFromX?: number
  projectileFromY?: number
  projectileToX?: number
  projectileToY?: number
  projectileReturn?: boolean
  projectileHit?: boolean
  fxDurationMs?: number
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  ttl: number
  size: number
  hue: number
  saturation?: number
  lightness?: number
  square?: boolean
  drag?: number
  gravity?: number
  alpha?: number
  delayMs?: number
  motion?: 'ballistic' | 'path'
  originX?: number
  originY?: number
  travelX?: number
  travelY?: number
  waveAmpX?: number
  waveAmpY?: number
  waveFreq?: number
  phase?: number
  loopAmp?: number
  loopCenter?: number
  loopSharpness?: number
  alphaCurve?: 'fade' | 'peak'
  blend?: 'source-over' | 'lighter'
}

type Pulse = {
  x: number
  y: number
  life: number
  ttl: number
  maxRadius: number
  hue: number
  alpha: number
}

type Flash = {
  x: number
  y: number
  life: number
  ttl: number
  maxRadius: number
  hue: number
  alpha: number
}

type PixiImpactOverlayProps = {
  bursts: ImpactBurst[]
  reducedMotion?: boolean
  className?: string
}

// Some embedded/mobile WebViews can lack ResizeObserver; avoid startup crashes.
const SafeResizeObserver: typeof ResizeObserver = typeof ResizeObserver !== 'undefined'
  ? ResizeObserver
  : class {
      constructor(_cb: ResizeObserverCallback) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    }

const SITE_FX_DURATION_MS = 2000

const elementPixelColor = (element: 'Air' | 'Earth' | 'Fire' | 'Water') => {
  if (element === 'Air') return { hue: 0, sat: 0, light: 72 }
  if (element === 'Earth') return { hue: 26, sat: 58, light: 38 }
  if (element === 'Fire') return { hue: 12, sat: 88, light: 56 }
  return { hue: 210, sat: 72, light: 50 }
}

const dedupeSiteElements = (elements: ImpactBurst['siteElements']): Array<'Air' | 'Earth' | 'Fire' | 'Water'> => {
  if (!Array.isArray(elements) || elements.length === 0) return []
  const uniq: Array<'Air' | 'Earth' | 'Fire' | 'Water'> = []
  for (const el of elements) {
    if (el !== 'Air' && el !== 'Earth' && el !== 'Fire' && el !== 'Water') continue
    if (!uniq.includes(el)) uniq.push(el)
  }
  return uniq
}

// Pixi-ready VFX overlay API. In this workspace, npm registry access may be
// unavailable, so this uses a canvas fallback while preserving the call-site
// contract for a future PIXI backend.
export function PixiImpactOverlay({ bursts, reducedMotion = false, className }: PixiImpactOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const pulsesRef = useRef<Pulse[]>([])
  const flashesRef = useRef<Flash[]>([])
  const seenBurstIdsRef = useRef<Set<number>>(new Set())
  const hostSizeRef = useRef({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      hostSizeRef.current = { width, height }
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const observer = new SafeResizeObserver(() => resize())
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const { width, height } = hostSizeRef.current
    if (!width || !height) return

    const seen = seenBurstIdsRef.current
    const spawnScale = reducedMotion ? 0.55 : 1
    const siteDurationMs = SITE_FX_DURATION_MS
    for (const burst of bursts) {
      if (seen.has(burst.id)) continue
      seen.add(burst.id)
      const baseX = (burst.x / 100) * width
      const baseY = (burst.y / 100) * height
      const kind = burst.kind ?? 'impact'
      const tileWidthPx = Math.max(16, width * ((burst.tileWidthPct ?? 8) / 100))
      const tileHeightPx = Math.max(16, height * ((burst.tileHeightPct ?? 8) / 100))
      const halfW = tileWidthPx * 0.5
      const halfH = tileHeightPx * 0.5
      const left = baseX - halfW
      const top = baseY - halfH
      const ttlFromDelay = (delayMs: number) => Math.max(140, siteDurationMs - delayMs)

      if (kind === 'projectile') {
        const fromX = (typeof burst.projectileFromX === 'number' ? burst.projectileFromX : burst.x) / 100 * width
        const fromY = (typeof burst.projectileFromY === 'number' ? burst.projectileFromY : burst.y) / 100 * height
        const toX = (typeof burst.projectileToX === 'number' ? burst.projectileToX : burst.x) / 100 * width
        const toY = (typeof burst.projectileToY === 'number' ? burst.projectileToY : burst.y) / 100 * height
        const travelX = toX - fromX
        const travelY = toY - fromY
        const distance = Math.hypot(travelX, travelY)
        if (!Number.isFinite(distance) || distance < 1) continue

        const dirX = travelX / Math.max(0.0001, distance)
        const dirY = travelY / Math.max(0.0001, distance)
        const perpX = -dirY
        const perpY = dirX
        const style = burst.projectileStyle ?? 'arrow'
        const totalMs = Math.max(220, burst.fxDurationMs ?? (style === 'hook' ? 900 : style === 'lightning' ? 760 : 620))
        const returnTrip = style === 'hook' && !!burst.projectileReturn
        const outwardMs = returnTrip ? Math.max(220, Math.round(totalMs * 0.52)) : totalMs
        const returnDelay = returnTrip ? outwardMs + 70 : 0
        const returnMs = returnTrip ? Math.max(220, totalMs - returnDelay) : 0

        const spawnImpact = burst.projectileHit !== false
        if (spawnImpact) {
          const fireImpact = style === 'fire'
          const lightningImpact = style === 'lightning'
          const impactHue = lightningImpact
            ? 202 + Math.random() * 18
            : fireImpact
              ? 24 + Math.random() * 10
              : 2 + Math.random() * 8
          flashesRef.current.push({
            x: toX,
            y: toY,
            life: 0,
            ttl: reducedMotion ? 160 : 230,
            maxRadius: lightningImpact ? 54 : fireImpact ? 50 : 44,
            hue: impactHue,
            alpha: lightningImpact ? 0.32 : fireImpact ? 0.28 : 0.24,
          })
          pulsesRef.current.push({
            x: toX,
            y: toY,
            life: 0,
            ttl: reducedMotion ? 220 : 340,
            maxRadius: lightningImpact ? 60 : fireImpact ? 54 : 46,
            hue: impactHue,
            alpha: lightningImpact ? 0.34 : fireImpact ? 0.29 : 0.26,
          })
          const splashCount = reducedMotion
            ? (lightningImpact ? 14 : fireImpact ? 12 : 9)
            : (lightningImpact ? 24 : fireImpact ? 20 : 16)
          for (let i = 0; i < splashCount; i += 1) {
            const angle = (Math.PI * 2 * i) / Math.max(1, splashCount) + Math.random() * 0.34
            const speed = (reducedMotion ? 0.028 : 0.042) + Math.random() * (reducedMotion ? 0.03 : 0.05)
            const isWhiteShard = lightningImpact && i % 3 === 0
            particlesRef.current.push({
              x: toX + (Math.random() * 2 - 1) * 2,
              y: toY + (Math.random() * 2 - 1) * 2,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0,
              ttl: reducedMotion ? 220 : 320,
              size: 5,
              hue: lightningImpact
                ? 198 + Math.random() * 20
                : fireImpact
                  ? 16 + Math.random() * 24
                  : 0 + Math.random() * 10,
              saturation: lightningImpact ? (isWhiteShard ? 24 : 86) : fireImpact ? 92 : 88,
              lightness: lightningImpact ? (isWhiteShard ? 92 : 66 + Math.random() * 12) : fireImpact ? 54 + Math.random() * 12 : 48 + Math.random() * 10,
              square: true,
              drag: reducedMotion ? 0.964 : 0.952,
              gravity: reducedMotion ? 0.00005 : 0.00012,
              alpha: 0.9,
              blend: 'lighter',
              alphaCurve: 'fade',
            })
          }
        }

        if (style === 'hook') {
          const chainSegments = Math.max(8, Math.min(52, Math.round(distance / 6)))
          const chainDelay = reducedMotion ? 20 : 14
          const chainColor = { hue: 0, saturation: 0, lightness: 74 }
          const pushChain = (originX: number, originY: number, tx: number, ty: number, delayBias: number, ttl: number) => {
            for (let i = 0; i < chainSegments; i += 1) {
              const side = i % 2 === 0 ? 1 : -1
              const offset = 5 * side
              const delay = delayBias + i * chainDelay
              particlesRef.current.push({
                x: originX + perpX * offset,
                y: originY + perpY * offset,
                vx: 0,
                vy: 0,
                life: 0,
                delayMs: delay,
                ttl: Math.max(180, ttl),
                size: 5,
                hue: chainColor.hue,
                saturation: chainColor.saturation,
                lightness: chainColor.lightness,
                square: true,
                motion: 'path',
                originX: originX + perpX * offset,
                originY: originY + perpY * offset,
                travelX: tx,
                travelY: ty,
                waveAmpX: 0,
                waveAmpY: 0,
                waveFreq: 1,
                phase: i * 0.35,
                alpha: 0.95,
                blend: 'source-over',
                alphaCurve: 'fade',
              })
            }
          }
          pushChain(fromX, fromY, travelX, travelY, 0, outwardMs)
          if (returnTrip) {
            pushChain(toX, toY, -travelX, -travelY, returnDelay, returnMs)
          }

          const hookShape: Array<[number, number]> = [
            [0, 0],
            [-4, 0],
            [-8, 2.5],
            [-8, -2.5],
            [-11, 4.5],
            [-11, -4.5],
          ]
          const pushHead = (originX: number, originY: number, tx: number, ty: number, delayBias: number, ttl: number) => {
            for (const [along, across] of hookShape) {
              const ox = originX + dirX * along + perpX * across
              const oy = originY + dirY * along + perpY * across
              particlesRef.current.push({
                x: ox,
                y: oy,
                vx: 0,
                vy: 0,
                life: 0,
                delayMs: delayBias,
                ttl: Math.max(180, ttl),
                size: 5,
                hue: 0,
                saturation: 0,
                lightness: 88,
                square: true,
                motion: 'path',
                originX: ox,
                originY: oy,
                travelX: tx,
                travelY: ty,
                waveAmpX: 0,
                waveAmpY: 0,
                waveFreq: 1,
                phase: 0,
                alpha: 0.98,
                blend: 'source-over',
                alphaCurve: 'fade',
              })
            }
          }
          pushHead(fromX, fromY, travelX, travelY, 0, outwardMs)
          if (returnTrip) {
            pushHead(toX, toY, -travelX, -travelY, returnDelay, returnMs)
          }
          continue
        }

        if (style === 'lightning') {
          const courseChanges = 7
          const segmentCount = courseChanges + 1
          const points: Array<{ x: number; y: number }> = [{ x: fromX, y: fromY }]
          const baseAmp = Math.max(18, Math.min(44, distance * 0.18))
          for (let seg = 1; seg < segmentCount; seg += 1) {
            const t = seg / segmentCount
            const polarity = seg % 2 === 0 ? 1 : -1
            const amp = baseAmp * (0.72 + Math.random() * 0.46)
            points.push({
              x: fromX + travelX * t + perpX * amp * polarity,
              y: fromY + travelY * t + perpY * amp * polarity,
            })
          }
          points.push({ x: toX, y: toY })

          // 5px pixels across roughly 10px total lightning width.
          const laneOffsets = [-2.5, 0, 2.5]
          const segmentDelay = Math.max(20, Math.round(totalMs / Math.max(1, points.length - 1)))
          for (let seg = 0; seg < points.length - 1; seg += 1) {
            const p0 = points[seg]!
            const p1 = points[seg + 1]!
            const dx = p1.x - p0.x
            const dy = p1.y - p0.y
            const segDist = Math.hypot(dx, dy)
            if (!Number.isFinite(segDist) || segDist < 1) continue
            const segDirX = dx / segDist
            const segDirY = dy / segDist
            const segPerpX = -segDirY
            const segPerpY = segDirX
            const pieces = Math.max(2, Math.round(segDist / 5))
            const delayMs = seg * segmentDelay
            for (const lane of laneOffsets) {
              for (let i = 0; i <= pieces; i += 1) {
                const t = i / Math.max(1, pieces)
                const ox = p0.x + dx * t + segPerpX * lane
                const oy = p0.y + dy * t + segPerpY * lane
                const whiteCore = lane === 0 && i % 2 === 0
                particlesRef.current.push({
                  x: ox,
                  y: oy,
                  vx: 0,
                  vy: 0,
                  life: 0,
                  delayMs,
                  ttl: Math.max(180, totalMs - delayMs + 60),
                  size: 5,
                  hue: whiteCore ? 206 + Math.random() * 8 : 198 + Math.random() * 20,
                  saturation: whiteCore ? 20 : 90,
                  lightness: whiteCore ? 92 : 62 + Math.random() * 14,
                  square: true,
                  motion: 'path',
                  originX: ox,
                  originY: oy,
                  travelX: dx,
                  travelY: dy,
                  waveAmpX: 0,
                  waveAmpY: 0,
                  waveFreq: 1,
                  phase: 0,
                  alpha: whiteCore ? 0.98 : 0.9,
                  blend: 'lighter',
                  alphaCurve: 'fade',
                })
              }
            }
          }
          continue
        }

        if (style === 'arrow' || style === 'fire') {
          const shaftCount = 3
          const shaftSpacing = 3.5
          const shaftTone = style === 'fire'
            ? { hue: 22, saturation: 94, lightness: 40, blend: 'lighter' as const }
            : { hue: 30, saturation: 45, lightness: 34, blend: 'source-over' as const }
          const tipTone = style === 'fire'
            ? { hue: 8, saturation: 96, lightness: 58 }
            : { hue: 8, saturation: 74, lightness: 64 }

          for (let seg = 0; seg < shaftCount; seg += 1) {
            const along = -seg * shaftSpacing
            const ox = fromX + dirX * along
            const oy = fromY + dirY * along
            particlesRef.current.push({
              x: ox,
              y: oy,
              vx: 0,
              vy: 0,
              life: 0,
              ttl: totalMs,
              size: 5,
              hue: shaftTone.hue + Math.random() * (style === 'fire' ? 8 : 4),
              saturation: shaftTone.saturation,
              lightness: shaftTone.lightness + Math.random() * 6,
              square: true,
              motion: 'path',
              originX: ox,
              originY: oy,
              travelX,
              travelY,
              waveAmpX: style === 'fire' ? 1.2 : 0,
              waveAmpY: style === 'fire' ? 1.2 : 0,
              waveFreq: style === 'fire' ? 7.2 : 1,
              phase: seg * 0.9,
              alpha: style === 'fire' ? 0.9 : 0.95,
              blend: shaftTone.blend,
              alphaCurve: 'fade',
            })
          }
          particlesRef.current.push({
            x: fromX + dirX * 1,
            y: fromY + dirY * 1,
            vx: 0,
            vy: 0,
            life: 0,
            ttl: totalMs,
            size: 5,
            hue: tipTone.hue,
            saturation: tipTone.saturation,
            lightness: tipTone.lightness,
            square: true,
            motion: 'path',
            originX: fromX + dirX * 1,
            originY: fromY + dirY * 1,
            travelX,
            travelY,
            waveAmpX: style === 'fire' ? 1.8 : 0,
            waveAmpY: style === 'fire' ? 1.6 : 0,
            waveFreq: style === 'fire' ? 8.4 : 1,
            phase: 0.35,
            alpha: 0.98,
            blend: style === 'fire' ? 'lighter' : 'source-over',
            alphaCurve: 'fade',
          })
          continue
        }
      }

      if (kind === 'site_play') {
        const style = burst.siteFxStyle ?? 'default'
        const mixedElements = dedupeSiteElements(burst.siteElements)

        if (style === 'earth') {
          const perimeter = Math.max(1, tileWidthPx * 2 + tileHeightPx * 2)
          const siteParticleCount = reducedMotion ? 180 : 500
          for (let i = 0; i < siteParticleCount; i += 1) {
            const edgePos = Math.random() * perimeter
            let ex = 0
            let ey = 0
            let nx = 0
            let ny = 0
            if (edgePos < tileWidthPx) {
              ex = edgePos - halfW
              ey = -halfH
              nx = 0
              ny = -1
            } else if (edgePos < tileWidthPx + tileHeightPx) {
              ex = halfW
              ey = edgePos - tileWidthPx - halfH
              nx = 1
              ny = 0
            } else if (edgePos < tileWidthPx * 2 + tileHeightPx) {
              ex = halfW - (edgePos - tileWidthPx - tileHeightPx)
              ey = halfH
              nx = 0
              ny = 1
            } else {
              ex = -halfW
              ey = halfH - (edgePos - tileWidthPx * 2 - tileHeightPx)
              nx = -1
              ny = 0
            }
            const tangentX = -ny
            const tangentY = nx
            const outwardSpeed = (reducedMotion ? 0.032 : 0.046) + Math.random() * (reducedMotion ? 0.05 : 0.09)
            const tangentSpeed = (Math.random() * 2 - 1) * (reducedMotion ? 0.022 : 0.048)
            const jitter = reducedMotion ? 0.8 : 1.8
            particlesRef.current.push({
              x: baseX + ex + (Math.random() * 2 - 1) * jitter,
              y: baseY + ey + (Math.random() * 2 - 1) * jitter,
              vx: nx * outwardSpeed + tangentX * tangentSpeed,
              vy: ny * outwardSpeed + tangentY * tangentSpeed,
              life: 0,
              ttl: siteDurationMs,
              size: 5,
              hue: 22 + Math.random() * 14,
              saturation: 42 + Math.random() * 30,
              lightness: 20 + Math.random() * 28,
              square: true,
              drag: reducedMotion ? 0.985 : 0.978,
              gravity: reducedMotion ? 0.0002 : 0.00045,
              alpha: 0.95,
              blend: 'source-over',
              alphaCurve: 'fade',
            })
          }
          continue
        }

        if (style === 'water') {
          const droplets = reducedMotion ? 150 : 360
          const perimeter = Math.max(1, tileWidthPx * 2 + tileHeightPx * 2)
          for (let i = 0; i < droplets; i += 1) {
            const edgePos = Math.random() * perimeter
            let ex = 0
            let ey = 0
            let nx = 0
            let ny = 0
            if (edgePos < tileWidthPx) {
              ex = edgePos - halfW
              ey = -halfH
              nx = 0
              ny = -1
            } else if (edgePos < tileWidthPx + tileHeightPx) {
              ex = halfW
              ey = edgePos - tileWidthPx - halfH
              nx = 1
              ny = 0
            } else if (edgePos < tileWidthPx * 2 + tileHeightPx) {
              ex = halfW - (edgePos - tileWidthPx - tileHeightPx)
              ey = halfH
              nx = 0
              ny = 1
            } else {
              ex = -halfW
              ey = halfH - (edgePos - tileWidthPx * 2 - tileHeightPx)
              nx = -1
              ny = 0
            }
            const tangentX = -ny
            const tangentY = nx
            const speed = (reducedMotion ? 0.026 : 0.042) + Math.random() * (reducedMotion ? 0.036 : 0.062)
            const tangentSpeed = (Math.random() * 2 - 1) * (reducedMotion ? 0.02 : 0.04)
            particlesRef.current.push({
              x: baseX + ex + (Math.random() * 2 - 1) * 1.6,
              y: baseY + ey + (Math.random() * 2 - 1) * 1.6,
              vx: nx * speed + tangentX * tangentSpeed,
              vy: ny * speed + tangentY * tangentSpeed,
              life: 0,
              ttl: siteDurationMs,
              size: 5,
              hue: 208 + Math.random() * 18,
              saturation: 62 + Math.random() * 24,
              lightness: 18 + Math.random() * 16,
              square: true,
              drag: reducedMotion ? 0.952 : 0.938,
              gravity: reducedMotion ? 0.00004 : 0.00008,
              alpha: 0.92,
              blend: 'source-over',
              alphaCurve: 'fade',
            })
          }
          continue
        }

        if (style === 'air') {
          const cornerInsetPx = Math.max(4, Math.min(20, halfW - 2, halfH - 2))
          const corners: Array<{ x: number; y: number; xSign: number; ySign: number }> = [
            { x: left + cornerInsetPx, y: top + cornerInsetPx, xSign: -1, ySign: -1 },
            { x: left + tileWidthPx - cornerInsetPx, y: top + cornerInsetPx, xSign: 1, ySign: -1 },
            { x: left + cornerInsetPx, y: top + tileHeightPx - cornerInsetPx, xSign: -1, ySign: 1 },
            { x: left + tileWidthPx - cornerInsetPx, y: top + tileHeightPx - cornerInsetPx, xSign: 1, ySign: 1 },
          ]
          for (let c = 0; c < corners.length; c += 1) {
            const corner = corners[c]
            for (let line = 0; line < 3; line += 1) {
              const baseOffset = (line - 1) * 6
              const points = reducedMotion ? 10 : 18
              for (let step = 0; step < points; step += 1) {
                const delay = step * (reducedMotion ? 34 : 24)
                particlesRef.current.push({
                  x: corner.x + corner.xSign * baseOffset,
                  y: corner.y + corner.ySign * Math.abs(baseOffset) * 0.3,
                  vx: 0,
                  vy: 0,
                  life: 0,
                  delayMs: delay,
                  ttl: ttlFromDelay(delay),
                  size: reducedMotion ? 4 : 5,
                  hue: 0,
                  saturation: 0,
                  lightness: 66 + Math.random() * 18,
                  square: true,
                  motion: 'path',
                  originX: corner.x + corner.xSign * baseOffset,
                  originY: corner.y,
                  travelX: corner.xSign * (6 + line * 2),
                  travelY: -(tileHeightPx * (1.84 + line * 0.16) + 36),
                  waveAmpX: 5 + line * 2 + Math.random() * 1.5,
                  waveAmpY: 1.6 + line * 0.6,
                  waveFreq: 9.6 + line * 1.15,
                  phase: c * 1.2 + line * 0.8 + step * 0.22,
                  loopAmp: 8 + line * 2.6,
                  loopCenter: 0.3,
                  loopSharpness: 6.4,
                  alpha: 0.86,
                  blend: 'lighter',
                  alphaCurve: 'fade',
                })
              }
            }
          }
          continue
        }

        if (style === 'fire') {
          for (let line = 0; line < 3; line += 1) {
            const xCol = left + tileWidthPx * (0.24 + line * 0.26)
            const points = reducedMotion ? 20 : 34
            for (let step = 0; step < points; step += 1) {
              const delay = step * (reducedMotion ? 36 : 24)
              particlesRef.current.push({
                x: xCol + (Math.random() * 2 - 1) * 1.4,
                y: top + tileHeightPx + 8,
                vx: 0,
                vy: 0,
                life: 0,
                delayMs: delay,
                ttl: ttlFromDelay(delay),
                size: 5,
                hue: 3 + Math.random() * 19,
                saturation: 82 + Math.random() * 14,
                lightness: 42 + Math.random() * 16,
                square: true,
                motion: 'path',
                originX: xCol,
                originY: top + tileHeightPx + 8,
                travelX: 0,
                travelY: -(tileHeightPx + 20),
                waveAmpX: 5 + line * 1.8 + Math.random() * 2,
                waveAmpY: 1.8 + Math.random() * 1.6,
                waveFreq: 10.4 + line * 0.9,
                phase: line * 1.4 + step * 0.25,
                alpha: 0.93,
                blend: 'lighter',
                alphaCurve: 'fade',
              })
            }
          }
          continue
        }

        if (style === 'multi' && mixedElements.length > 0) {
          const strands = Math.max(2, mixedElements.length)
          for (let strand = 0; strand < strands; strand += 1) {
            const element = mixedElements[strand % mixedElements.length]!
            const tone = elementPixelColor(element)
            const points = reducedMotion ? 20 : 34
            for (let step = 0; step < points; step += 1) {
              const delay = step * (reducedMotion ? 34 : 22)
              particlesRef.current.push({
                x: left - 8,
                y: baseY,
                vx: 0,
                vy: 0,
                life: 0,
                delayMs: delay,
                ttl: ttlFromDelay(delay),
                size: reducedMotion ? 4 : 5,
                hue: tone.hue,
                saturation: Math.min(100, tone.sat + 18),
                lightness: Math.min(92, tone.light + 14),
                square: true,
                motion: 'path',
                originX: left - 8,
                originY: baseY,
                travelX: tileWidthPx + 18,
                travelY: 0,
                waveAmpX: 2.1 + strand * 0.6,
                waveAmpY: 8 + strand * 1.9,
                waveFreq: 10.8 + strand * 0.8,
                phase: strand * (Math.PI * 2 / strands) + step * 0.21,
                alpha: 0.9,
                blend: 'lighter',
                alphaCurve: 'fade',
              })
            }
          }
          continue
        }

        if (style === 'neutral') {
          const lanes = 9
          const laneHeight = tileHeightPx / lanes
          const points = reducedMotion ? 70 : 120
          for (let i = 0; i < points; i += 1) {
            const lane = i % lanes
            const delay = i * (reducedMotion ? 8 : 6)
            particlesRef.current.push({
              x: left - tileWidthPx * 0.14,
              y: top + laneHeight * (lane + 0.5),
              vx: 0,
              vy: 0,
              life: 0,
              delayMs: delay,
              ttl: ttlFromDelay(delay),
              size: reducedMotion ? 4 : 5,
              hue: 50 + Math.random() * 10,
              saturation: 20 + Math.random() * 26,
              lightness: 76 + Math.random() * 16,
              square: true,
              motion: 'path',
              originX: left - tileWidthPx * 0.14,
              originY: top + laneHeight * (lane + 0.5),
              travelX: tileWidthPx * 1.34,
              travelY: (Math.random() * 2 - 1) * 4,
              waveAmpX: 0.8,
              waveAmpY: 2 + Math.random() * 1.6,
              waveFreq: 7.2 + Math.random() * 1.4,
              phase: lane * 0.7 + i * 0.08,
              alpha: 0.96,
              blend: 'lighter',
              alphaCurve: 'peak',
            })
          }
          continue
        }
      }

      const profile = kind === 'site_play'
        ? { count: reducedMotion ? 8 : 12, hueMin: 42, hueMax: 78, spread: 0.75, ttl: siteDurationMs, size: reducedMotion ? 2.2 : 3.2, pulse: true, flashAlpha: 0.2, flashRadius: 42 }
        : kind === 'undead_summon'
          ? { count: reducedMotion ? 6 : 11, hueMin: 114, hueMax: 162, spread: 0.7, ttl: reducedMotion ? 420 : 620, size: reducedMotion ? 2.3 : 3.4, pulse: true, flashAlpha: 0.24, flashRadius: 52 }
          : kind === 'unit_destroyed'
            ? { count: reducedMotion ? 7 : 12, hueMin: 6, hueMax: 34, spread: 1.1, ttl: reducedMotion ? 320 : 520, size: reducedMotion ? 2.1 : 3.5, pulse: true, flashAlpha: 0.28, flashRadius: 58 }
            : { count: reducedMotion ? 4 : 9, hueMin: 22, hueMax: 54, spread: 1, ttl: reducedMotion ? 300 : 500, size: reducedMotion ? 1.9 : 2.8, pulse: false, flashAlpha: 0.14, flashRadius: 38 }
      const particlesPerBurst = Math.max(3, Math.floor(profile.count * spawnScale))

      flashesRef.current.push({
        x: baseX,
        y: baseY,
        life: 0,
        ttl: reducedMotion ? 160 : 260,
        maxRadius: profile.flashRadius,
        hue: profile.hueMin + (profile.hueMax - profile.hueMin) * 0.5,
        alpha: profile.flashAlpha,
      })

      if (profile.pulse) {
        pulsesRef.current.push({
          x: baseX,
          y: baseY,
          life: 0,
          ttl: profile.ttl,
          maxRadius: kind === 'unit_destroyed' ? 52 : kind === 'undead_summon' ? 46 : 40,
          hue: profile.hueMin + (profile.hueMax - profile.hueMin) * 0.5,
          alpha: kind === 'unit_destroyed' ? 0.34 : 0.26,
        })
      }

      for (let i = 0; i < particlesPerBurst; i += 1) {
        const t = i / Math.max(1, particlesPerBurst - 1)
        const spreadX = burst.dx * profile.spread * (0.38 + Math.random() * 0.64)
        const spreadY = burst.dy * profile.spread * (0.38 + Math.random() * 0.64)
        const hue = profile.hueMin + (profile.hueMax - profile.hueMin) * t + Math.random() * 6
        particlesRef.current.push({
          x: baseX + (Math.random() * 6 - 3),
          y: baseY + (Math.random() * 6 - 3),
          vx: spreadX * (0.010 + Math.random() * 0.006),
          vy: spreadY * (0.010 + Math.random() * 0.006),
          life: 0,
          ttl: kind === 'site_play' ? profile.ttl : profile.ttl + Math.random() * 120,
          size: profile.size + Math.random() * 2.4,
          hue,
          blend: 'lighter',
          alphaCurve: 'fade',
        })
      }
    }
    const particleBudget = reducedMotion ? 3200 : 9600
    if (particlesRef.current.length > particleBudget) {
      particlesRef.current.splice(0, particlesRef.current.length - particleBudget)
    }
  }, [bursts, reducedMotion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let prevTs = performance.now()
    const tick = (ts: number) => {
      const dt = Math.min(48, Math.max(0, ts - prevTs))
      prevTs = ts
      const { width, height } = hostSizeRef.current

      ctx.clearRect(0, 0, width, height)
      if (flashesRef.current.length > 0) {
        const nextFlashes: Flash[] = []
        for (const flash of flashesRef.current) {
          const life = flash.life + dt
          if (life >= flash.ttl) continue
          const t = life / flash.ttl
          const radius = flash.maxRadius * (0.18 + t * 0.82)
          const alpha = (1 - t) * flash.alpha
          const grad = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius)
          grad.addColorStop(0, `hsla(${flash.hue}, 98%, 74%, ${alpha})`)
          grad.addColorStop(0.6, `hsla(${flash.hue}, 96%, 56%, ${alpha * 0.32})`)
          grad.addColorStop(1, `hsla(${flash.hue}, 94%, 44%, 0)`)
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = 1
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2)
          ctx.fill()
          nextFlashes.push({ ...flash, life })
        }
        flashesRef.current = nextFlashes
      }
      if (pulsesRef.current.length > 0) {
        const nextPulses: Pulse[] = []
        for (const pulse of pulsesRef.current) {
          const life = pulse.life + dt
          if (life >= pulse.ttl) continue
          const t = life / pulse.ttl
          const radius = pulse.maxRadius * (0.2 + t * 0.8)
          const alpha = (1 - t) * pulse.alpha
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = alpha
          ctx.strokeStyle = `hsl(${pulse.hue}, 86%, 64%)`
          ctx.lineWidth = Math.max(1, 2.8 * (1 - t))
          ctx.beginPath()
          ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2)
          ctx.stroke()
          nextPulses.push({ ...pulse, life })
        }
        pulsesRef.current = nextPulses
      }
      if (particlesRef.current.length > 0) {
        const next: Particle[] = []

        for (const p of particlesRef.current) {
          const life = p.life + dt
          const delayMs = Math.max(0, p.delayMs ?? 0)
          if (life < delayMs) {
            next.push({ ...p, life })
            continue
          }
          const activeLife = life - delayMs
          if (activeLife >= p.ttl) continue
          const progress = Math.min(1, Math.max(0, activeLife / p.ttl))

          let x = p.x
          let y = p.y
          let vx = p.vx
          let vy = p.vy

          if (p.motion === 'path') {
            const ox = p.originX ?? p.x
            const oy = p.originY ?? p.y
            const tx = p.travelX ?? 0
            const ty = p.travelY ?? 0
            const freq = p.waveFreq ?? 8
            const phase = p.phase ?? 0
            const waveX = Math.sin(progress * freq + phase) * (p.waveAmpX ?? 0)
            const waveY = Math.sin(progress * freq * 0.82 + phase * 1.07) * (p.waveAmpY ?? 0)
            const loopAmp = p.loopAmp ?? 0
            const loopCenter = p.loopCenter ?? 0.3
            const loopSharpness = p.loopSharpness ?? 6
            const loopEnvelope = Math.exp(-Math.pow((progress - loopCenter) * loopSharpness, 2))
            const loopWave = Math.sin(progress * Math.PI * 2 + phase) * loopAmp * loopEnvelope
            x = ox + tx * progress + waveX
            y = oy + ty * progress + waveY + loopWave
            vx = 0
            vy = 0
          } else {
            const gravity = typeof p.gravity === 'number'
              ? p.gravity
              : (reducedMotion ? 0.0006 : 0.0012)
            const drag = typeof p.drag === 'number'
              ? p.drag
              : (reducedMotion ? 0.986 : 0.978)
            vx = p.vx * drag
            vy = (p.vy + gravity * dt) * drag
            x = p.x + vx * dt
            y = p.y + vy * dt
          }

          let alpha = (1 - progress) * (p.alpha ?? 0.92)
          if (p.alphaCurve === 'peak') {
            alpha *= Math.pow(Math.sin(Math.PI * progress), 1.25)
          }
          if (alpha <= 0.001) {
            next.push({ ...p, x, y, vx, vy, life })
            continue
          }

          if (p.square) {
            const size = Math.max(1, Math.round(p.size))
            ctx.globalCompositeOperation = p.blend ?? 'source-over'
            ctx.globalAlpha = alpha
            ctx.fillStyle = `hsl(${p.hue}, ${p.saturation ?? 94}%, ${p.lightness ?? 68}%)`
            ctx.fillRect(
              Math.round(x - size * 0.5),
              Math.round(y - size * 0.5),
              size,
              size,
            )
          } else {
            const size = Math.max(0.3, p.size * (0.45 + (1 - progress) * 0.8))
            ctx.globalCompositeOperation = p.blend ?? 'lighter'
            ctx.globalAlpha = alpha
            ctx.fillStyle = `hsl(${p.hue}, ${p.saturation ?? 94}%, ${p.lightness ?? 68}%)`
            ctx.beginPath()
            ctx.arc(x, y, size, 0, Math.PI * 2)
            ctx.fill()
          }

          next.push({ ...p, x, y, vx, vy, life })
        }

        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        particlesRef.current = next
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [reducedMotion])

  return (
    <div ref={hostRef} className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  )
}
