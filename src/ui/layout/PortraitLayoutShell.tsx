import React from 'react'
import styles from './PortraitLayoutShell.module.css'

type PortraitDrawerTab = {
  id: string
  label: string
  content: React.ReactNode
}

type PortraitLayoutShellProps = {
  turnBar: React.ReactNode
  board: React.ReactNode
  statusBar?: React.ReactNode
  drawerTabs: PortraitDrawerTab[]
  activeDrawerTab: string
  onSelectDrawerTab: (tabId: string) => void
  inspector?: React.ReactNode
}

export function PortraitLayoutShell({
  turnBar,
  board,
  statusBar,
  drawerTabs,
  activeDrawerTab,
  onSelectDrawerTab,
  inspector,
}: PortraitLayoutShellProps) {
  const active = drawerTabs.find((tab) => tab.id === activeDrawerTab) ?? drawerTabs[0]
  return (
    <div className={styles.shell}>
      <div className={styles.turnBar}>{turnBar}</div>
      <div className={styles.board}>{board}</div>
      {statusBar ? <div className={styles.statusBar}>{statusBar}</div> : null}
      <div className={styles.drawers}>
        <div className={styles.drawerTabRail} role="tablist" aria-label="Portrait drawer tabs">
          {drawerTabs.map((tab) => {
            const selected = tab.id === active?.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`btn ${styles.drawerTabButton}${selected ? ` ${styles.drawerTabButtonActive}` : ''}`}
                onClick={() => onSelectDrawerTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className={styles.drawerPanel}>{active?.content ?? null}</div>
      </div>
      <div className={styles.inspector}>{inspector}</div>
    </div>
  )
}
