import React from 'react'

type Props = {
  children: React.ReactNode
}

export function TabletLandscapeLayout({ children }: Props) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#050607',
        color: '#f5f5f5',
      }}
    >
      {children}
    </div>
  )
}
