import React from 'react'

type InspectorPanelProps = { children: React.ReactNode }

export function InspectorPanel({ children }: InspectorPanelProps) {
  return <div>{children}</div>
}
