import React from 'react'

type Props = {
  children: React.ReactNode
}

export function PhonePortraitLayout({ children }: Props) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#050607',
        color: '#f5f5f5',
        padding: '8px',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        gap: 8,
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  )
}
