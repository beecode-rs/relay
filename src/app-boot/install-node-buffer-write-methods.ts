import { Buffer } from 'buffer'

const NODE_WRITE_METHOD_ENCODINGS = {
  asciiWrite: 'ascii',
  base64Write: 'base64',
  hexWrite: 'hex',
  latin1Write: 'latin1',
  ucs2Write: 'ucs2',
  utf8Write: 'utf8',
} as const

type NodeWriteEncoding = (typeof NODE_WRITE_METHOD_ENCODINGS)[keyof typeof NODE_WRITE_METHOD_ENCODINGS]

type NodeWriteMethodName = keyof typeof NODE_WRITE_METHOD_ENCODINGS

type NodeWriteMethod = (this: Buffer, string: string, offset?: number, length?: number) => number

type PatchableBufferPrototype = Partial<Record<NodeWriteMethodName, NodeWriteMethod>>

const NODE_WRITE_METHOD_NAMES = Object.keys(NODE_WRITE_METHOD_ENCODINGS) as NodeWriteMethodName[]

export const installNodeBufferWriteMethods = {
  _toNodeWriteMethod(encoding: NodeWriteEncoding): NodeWriteMethod {
    return function (this: Buffer, string: string, offset?: number, length?: number): number {
      const start = offset ?? 0

      return this.write(string, start, length ?? this.length - start, encoding)
    }
  },

  install(bufferConstructor: typeof Buffer = Buffer): void {
    const prototype = bufferConstructor.prototype as unknown as PatchableBufferPrototype

    NODE_WRITE_METHOD_NAMES.forEach((methodName) => {
      if (prototype[methodName] !== undefined) {
        return
      }
      prototype[methodName] = installNodeBufferWriteMethods._toNodeWriteMethod(NODE_WRITE_METHOD_ENCODINGS[methodName])
    })
  },
}
