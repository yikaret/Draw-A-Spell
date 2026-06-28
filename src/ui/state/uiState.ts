import { useState } from 'react'

export type OpenPanel = 'hand' | 'log' | 'inspect' | null

export type UiState = {
  selectedCardId: string | null
  selectedTile: { x: number; y: number } | null
  openPanel: OpenPanel
  boardZoom: number
}

const defaultUiState: UiState = {
  selectedCardId: null,
  selectedTile: null,
  openPanel: null,
  boardZoom: 1,
}

export function useUiState(initial?: Partial<UiState>) {
  const [uiState, setUiState] = useState<UiState>({ ...defaultUiState, ...initial })
  return { uiState, setUiState }
}
