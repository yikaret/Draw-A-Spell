import type { MpMessage } from './mpTypes'

export type MpClient = {
  ws: WebSocket
  send: (msg: MpMessage | any) => void
  close: () => void
}

export function safeJsonParse(data: unknown): any | null {
  try {
    if (typeof data === 'string') return JSON.parse(data)

    if (data instanceof ArrayBuffer) {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(data))
      return JSON.parse(text)
    }

    // Some browsers deliver Blob frames; the app primarily uses text frames.
    return null
  } catch {
    return null
  }
}

export function connectMp(
  url: string,
  handlers: {
    onOpen?: () => void
    onMessage?: (msg: any) => void
    onClose?: () => void
    onError?: () => void
  } = {},
): MpClient {
  const ws = new WebSocket(url)

  const send = (msg: MpMessage | any) => {
    if (ws.readyState !== ws.OPEN) return
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // ignore
    }
  }

  ws.onopen = () => handlers.onOpen?.()
  ws.onmessage = (evt) => {
    const parsed = safeJsonParse((evt as MessageEvent).data)
    if (parsed) handlers.onMessage?.(parsed)
  }
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = () => handlers.onError?.()

  return { ws, send, close: () => ws.close() }
}
