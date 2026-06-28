import { useEffect, useState } from 'react'

export const MOTION = {
  duration: {
    fast: 0.12,
    med: 0.2,
    slow: 0.35,
  },
  easing: {
    ui: 'cubic-bezier(0.22, 1, 0.36, 1)',
    physical: 'cubic-bezier(0.2, 0.9, 0.26, 1)',
    impact: 'cubic-bezier(0.11, 0, 0.5, 0)',
  },
  stagger: {
    cardFanReflowMs: 16,
  },
  drag: {
    thresholdPx: 8,
  },
  hover: {
    tiltDeg: 7,
    liftPx: 16,
  },
  impact: {
    hitStopMs: 72,
    shakeMs: 160,
  },
} as const

export function readReducedMotionPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => readReducedMotionPreference())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  return reduced
}
