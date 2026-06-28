import React from 'react'

type HandPanelProps = {
  children: React.ReactNode
}

export function HandPanel({ children }: HandPanelProps) {
  return <div>{children}</div>
}
