import React from 'react'

type BoardViewProps = {
  board: React.ReactNode
  lookOverlay?: React.ReactNode
  overlayActive?: boolean
  overlayContent?: React.ReactNode
  startPhaseBanner?: React.ReactNode
  decksPanel?: React.ReactNode
  footerBadge?: React.ReactNode
}

export function BoardView({
  board,
  lookOverlay,
  overlayActive,
  overlayContent,
  startPhaseBanner,
  decksPanel,
  footerBadge,
}: BoardViewProps) {
  return (
    <div style={{ position: 'relative', display: 'block', width: '100%', height: '100%' }}>
      <div style={{ width: '100%', height: '100%' }}>
        {board}
        {lookOverlay}
      </div>
      {overlayActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            pointerEvents: 'auto',
            zIndex: 6000,
            background: 'rgba(2, 5, 9, 0.9)',
          }}
        >
          {overlayContent}
        </div>
      )}
      {startPhaseBanner}
      {decksPanel}
      {footerBadge}
    </div>
  )
}
