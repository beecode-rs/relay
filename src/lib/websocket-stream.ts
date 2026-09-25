import { Duplex } from 'stream'

export class WebsocketStream extends Duplex {
  protected _isSocketCloseRequested: boolean
  protected _isSocketReady: boolean
  protected _pendingFrames: Uint8Array[]
  protected readonly _socket: WebSocket

  constructor(params: { url: string }) {
    super({
      read: (_size: number): void => {
        return undefined
      },
      write: (chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void => {
        this._writeFrame(chunk, callback)
      },
    })
    this._isSocketCloseRequested = false
    this._isSocketReady = false
    this._pendingFrames = []
    this._socket = new WebSocket(params.url)
    this._socket.binaryType = 'arraybuffer'
    this.on('close', () => {
      this._closeSocket()
    })
    this._socket.addEventListener('close', (event: CloseEvent) => {
      this._onClose(event)
    })
    this._socket.addEventListener('error', () => {
      this._onError()
    })
    this._socket.addEventListener('message', (event: MessageEvent) => {
      this._onMessage(event.data)
    })
    this._socket.addEventListener('open', () => {
      this._onOpen()
    })
  }

  protected _onOpen(): void {
    this._isSocketReady = true
    this._pendingFrames.forEach((frame) => {
      this._socket.send(frame)
    })
    this._pendingFrames = []
  }

  protected _writeFrame(chunk: Buffer, callback: (error?: Error | null) => void): void {
    const frame = new Uint8Array(chunk)
    if (!this._isSocketReady) {
      this._pendingFrames.push(frame)
      callback()

      return
    }
    try {
      this._socket.send(frame)
      callback()
    } catch (err) {
      if (err instanceof Error) {
        callback(err)

        return
      }
      callback(new Error(String(err)))
    }
  }

  protected _closeSocket(): void {
    this._isSocketCloseRequested = true
    this._socket.close()
  }

  protected _onClose(event: CloseEvent): void {
    if (this.destroyed) {
      return
    }
    if (this.writableEnded || this._isSocketCloseRequested || event.code === 1000 || event.code === 1005) {
      this.push(null)

      return
    }
    this.destroy(new Error(event.reason || `WebSocket relay closed with code ${String(event.code)}`))
  }

  override destroy(error?: Error): this {
    this._clearStaleWritableFlag()

    return super.destroy(error)
  }

  protected _clearStaleWritableFlag(): void {
    Object.defineProperty(this, 'writable', { configurable: true, value: false, writable: true })
  }

  protected _onError(): void {
    if (this.destroyed) {
      return
    }
    this.destroy(new Error('Unable to reach the SSH relay. Is it running? (pnpm relay)'))
  }

  protected _onMessage(data: unknown): void {
    if (this.destroyed) {
      return
    }
    if (typeof data === 'string') {
      this.destroy(new Error('WebSocket relay sent an unexpected text frame'))

      return
    }
    this.push(Buffer.from(data as ArrayBuffer))
  }
}
