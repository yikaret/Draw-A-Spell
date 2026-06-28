import React from 'react'

type PlayerHUDProps = {
  hud: React.ReactNode
  handSummary?: React.ReactNode
}

export function PlayerHUD({ hud, handSummary }: PlayerHUDProps) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', width: '100%', flexWrap: 'wrap' }}>
      <div className="retro-hud-shell" style={{ flex: '1 1 320px', minWidth: 260 }}>
        {hud}
      </div>
      {handSummary}
    </div>
  )
}
