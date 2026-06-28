import { useEffect, useState } from 'react'

export type ViewportInfo = {
  width: number
  height: number
  orientation: 'portrait' | 'landscape'
  isTablet: boolean
}

export function useViewport(): ViewportInfo {
  const getInfo = (): ViewportInfo => {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0, orientation: 'portrait', isTablet: false }
    }
    const width = window.innerWidth
    const height = window.innerHeight
    const orientation = width >= height ? 'landscape' : 'portrait'
    const isTablet = width >= 900
    return { width, height, orientation, isTablet }
  }

  const [info, setInfo] = useState<ViewportInfo>(() => getInfo())

  useEffect(() => {
    const handle = () => setInfo(getInfo())
    window.addEventListener('resize', handle)
    const mq = window.matchMedia('(orientation: landscape)')
    mq.addEventListener('change', handle)
    return () => {
      window.removeEventListener('resize', handle)
      mq.removeEventListener('change', handle)
    }
  }, [])

  return info
}
