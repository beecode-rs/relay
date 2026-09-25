import tcpSocket from 'react-native-tcp-socket'

type TcpSocketInternalState = {
  _destroyed?: boolean
  _paused?: boolean
  _pending?: boolean
}

type NodeStreamState = {
  ended: boolean
}

type SocketPauseMethod = (this: TcpSocketInternalState) => unknown

type GuardedSocketPauseMethod = SocketPauseMethod & {
  isTcpSocketNodeCompatPauseGuard: boolean
}

type SocketEmitMethod = (this: TcpSocketInternalState, event: string, ...args: unknown[]) => unknown

type GuardedSocketEmitMethod = SocketEmitMethod & {
  isTcpSocketNodeCompatErrorEmitGuard: boolean
}

type SocketErrorLikePayload = {
  code?: unknown
  message?: unknown
}

type NodeSocketError = Error & {
  code?: string
}

type PatchableSocketConstructor = new () => unknown

type PatchableSocketPrototype = {
  _readableState?: NodeStreamState
  emit?: SocketEmitMethod
  pause?: SocketPauseMethod
  readable?: boolean
  setMaxListeners?: (maxListeners: number) => void
  writable?: boolean
}

type SocketGetterName = 'readable' | 'writable'

const NODE_STREAM_GETTER_NAMES: SocketGetterName[] = ['readable', 'writable']

type SocketGetterTarget = TcpSocketInternalState

export const tcpSocketNodeCompat = {
  _installErrorEventNormalization(prototype: PatchableSocketPrototype): void {
    const emitMethod = prototype.emit
    if (emitMethod === undefined || tcpSocketNodeCompat._isErrorEmitGuardInstalled(emitMethod)) {
      return
    }
    const guardedEmit = function (this: TcpSocketInternalState, event: string, ...args: unknown[]): unknown {
      if (event !== 'error') {
        return emitMethod.call(this, event, ...args)
      }

      return emitMethod.call(this, event, tcpSocketNodeCompat._toNodeError(args[0]))
    }
    prototype.emit = Object.assign(guardedEmit, { isTcpSocketNodeCompatErrorEmitGuard: true })
  },

  _installMaxListenersNoop(prototype: PatchableSocketPrototype): void {
    if (prototype.setMaxListeners !== undefined) {
      return
    }
    prototype.setMaxListeners = (_maxListeners: number) => {
      return undefined
    }
  },

  _installNodeStreamGetters(prototype: PatchableSocketPrototype): void {
    NODE_STREAM_GETTER_NAMES.forEach((getterName) => {
      if (prototype[getterName] !== undefined) {
        return
      }
      Object.defineProperty(prototype, getterName, {
        configurable: true,
        get: function (this: SocketGetterTarget): boolean {
          return this._destroyed !== true
        },
      })
    })
    if (prototype._readableState === undefined) {
      Object.defineProperty(prototype, '_readableState', {
        configurable: true,
        get: function (this: SocketGetterTarget): NodeStreamState {
          return { ended: this._destroyed === true }
        },
      })
    }
  },

  _installPauseBeforeConnectGuard(prototype: PatchableSocketPrototype): void {
    const pauseMethod = prototype.pause
    if (pauseMethod === undefined || tcpSocketNodeCompat._isPauseGuardInstalled(pauseMethod)) {
      return
    }
    const guardedPause = function (this: TcpSocketInternalState): unknown {
      if (tcpSocketNodeCompat._isSocketConnectedToNative(this)) {
        return pauseMethod.call(this)
      }
      this._paused = true

      return this
    }
    prototype.pause = Object.assign(guardedPause, { isTcpSocketNodeCompatPauseGuard: true })
  },

  _isErrorEmitGuardInstalled(emitMethod: SocketEmitMethod): boolean {
    return (emitMethod as GuardedSocketEmitMethod).isTcpSocketNodeCompatErrorEmitGuard
  },

  _isPauseGuardInstalled(pauseMethod: SocketPauseMethod): boolean {
    return (pauseMethod as GuardedSocketPauseMethod).isTcpSocketNodeCompatPauseGuard
  },

  _isSocketConnectedToNative(socket: TcpSocketInternalState): boolean {
    if (socket._destroyed === true) {
      return false
    }

    return socket._pending === false
  },

  _toErrorCode(payload: unknown): string | undefined {
    if (typeof payload !== 'object' || payload === null) {
      return undefined
    }
    const code = (payload as SocketErrorLikePayload).code
    if (typeof code === 'string') {
      return code
    }

    return undefined
  },

  _toErrorMessage(payload: unknown): string {
    if (typeof payload === 'object' && payload !== null) {
      const message = (payload as SocketErrorLikePayload).message
      if (typeof message === 'string' && message.length > 0) {
        return message
      }
    }

    return String(payload)
  },

  _toNodeError(payload: unknown): NodeSocketError {
    if (payload instanceof Error) {
      return payload
    }
    const error = new Error(tcpSocketNodeCompat._toErrorMessage(payload)) as NodeSocketError
    const code = tcpSocketNodeCompat._toErrorCode(payload)
    if (code !== undefined) {
      error.code = code
    }

    return error
  },

  install(socketConstructor: PatchableSocketConstructor = tcpSocket.Socket): void {
    const prototype = socketConstructor.prototype as unknown as PatchableSocketPrototype
    tcpSocketNodeCompat._installErrorEventNormalization(prototype)
    tcpSocketNodeCompat._installMaxListenersNoop(prototype)
    tcpSocketNodeCompat._installNodeStreamGetters(prototype)
    tcpSocketNodeCompat._installPauseBeforeConnectGuard(prototype)
  },
}
