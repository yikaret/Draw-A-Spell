import React from 'react'
import { useViewport } from './useViewport'
import { PhonePortraitLayout } from './PhonePortraitLayout'
import { TabletLandscapeLayout } from './TabletLandscapeLayout'

type Props = {
  phone: React.ReactNode
  tablet: React.ReactNode
}

export function AppShell({ phone, tablet }: Props) {
  const { isTablet, orientation } = useViewport()
  const useTabletLayout = isTablet && orientation === 'landscape'
  return useTabletLayout ? <TabletLandscapeLayout>{tablet}</TabletLandscapeLayout> : <PhonePortraitLayout>{phone}</PhonePortraitLayout>
}
