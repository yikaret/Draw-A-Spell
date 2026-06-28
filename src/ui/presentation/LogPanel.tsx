import React from 'react'

type LogPanelProps = { children: React.ReactNode }

export function LogPanel({ children }: LogPanelProps) {
  return <div>{children}</div>
}
