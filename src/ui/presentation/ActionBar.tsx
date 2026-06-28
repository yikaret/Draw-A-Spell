import React from 'react'

type ActionBarProps = {
  children: React.ReactNode
}

export function ActionBar({ children }: ActionBarProps) {
  return (
    <div className="panel" style={{ padding: 8, marginTop: 4 }}>
      <div
        className="rowwrap"
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {children}
      </div>
    </div>
  )
}
