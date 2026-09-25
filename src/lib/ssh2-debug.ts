import { type DebugFunction } from 'ssh2'

import { config } from '@/constants/config'

const FIRST_CHUNK_PREVIEW_BYTES = 64
const LOG_PREFIX = '[ssh2]'

type TraceableSocket = {
  on?: (event: string, listener: (arg?: unknown) => void) => unknown
  once?: (event: string, listener: (arg?: unknown) => void) => unknown
}

type SocketHoldingClient = {
  _sock?: TraceableSocket
}

export type Ssh2SocketProbeSnapshot = {
  firstChunkHex: string | null
  lastError: string | null
  receivedBytes: number
}

export type Ssh2SocketProbe = {
  snapshot: () => Ssh2SocketProbeSnapshot
}

const toHexPreview = (chunk: Uint8Array): string => {
  const previewBytes = chunk.subarray(0, FIRST_CHUNK_PREVIEW_BYTES)

  return Array.from(previewBytes, (byte) => {
    return byte.toString(16).padStart(2, '0')
  }).join('')
}

const toFirstChunkStartsWithSshBanner = (firstChunkHex: string): boolean => {
  if (firstChunkHex.length < 8) {
    return false
  }

  return firstChunkHex.startsWith('5353482d')
}

export const ssh2Debug = {
  _log(message: string): void {
    if (!this.isEnabled()) {
      return
    }
     
    console.log(`${LOG_PREFIX} ${message}`)
  },

  isEnabled(): boolean {
    return config.isDevelopment
  },

  logClientError(params: { error: Error }): void {
    this._log(`client error event: ${String(params.error)}`)
  },

  probeSocket(params: { client: unknown }): Ssh2SocketProbe | null {
    const socket = (params.client as SocketHoldingClient)._sock
    if (!socket || typeof socket.on !== 'function') {
      this._log('socket probe unavailable: no socket exposed yet')

      return null
    }
    const snapshot: Ssh2SocketProbeSnapshot = {
      firstChunkHex: null,
      lastError: null,
      receivedBytes: 0,
    }
    socket.once?.('data', (chunk) => {
      if (!(chunk instanceof Uint8Array)) {
        return
      }
      snapshot.firstChunkHex = toHexPreview(chunk)
      this._log(`socket first data chunk (${snapshot.firstChunkHex})`)
    })
    socket.on('data', (chunk) => {
      if (chunk instanceof Uint8Array) {
        snapshot.receivedBytes += chunk.byteLength
      }
    })
    socket.on('close', (hadError) => {
      this._log(`socket close event (hadError=${String(hadError)})`)
    })
    socket.on('end', () => {
      this._log('socket end event')
    })
    socket.on('error', (err) => {
      snapshot.lastError = String(err)
      this._log(`socket error event: ${snapshot.lastError}`)
    })

    return {
      snapshot: () => {
        return { ...snapshot }
      },
    }
  },

  toDebugLogger(): DebugFunction | undefined {
    if (!this.isEnabled()) {
      return undefined
    }

    return (message: string) => {
      this._log(message)
    }
  },

  toHandshakeFailureHint(params: {
    firstChunkHex: string | null
    host: string
    port: number
    receivedBytes: number
  }): string {
    const target = `${params.host}:${String(params.port)}`
    if (params.receivedBytes === 0) {
      return `${target} accepted the TCP connection but sent no SSH banner - it is likely not an SSH server, a firewall or middlebox is interfering, or the connection was closed before the server responded`
    }
    if (params.firstChunkHex !== null && !toFirstChunkStartsWithSshBanner(params.firstChunkHex)) {
      return `${target} sent ${String(params.receivedBytes)} bytes of non-SSH data starting with ${params.firstChunkHex} - the target is not an SSH server on this port`
    }

    return `${target} sent an SSH banner (${String(params.receivedBytes)} bytes received) but the handshake did not complete`
  },
}
