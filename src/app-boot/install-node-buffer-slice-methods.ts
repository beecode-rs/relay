import { Buffer } from 'buffer'

const NODE_SLICE_METHOD_ENCODINGS = {
  asciiSlice: 'ascii',
  base64Slice: 'base64',
  hexSlice: 'hex',
  latin1Slice: 'latin1',
  ucs2Slice: 'ucs2',
  utf8Slice: 'utf8',
} as const

type NodeSliceEncoding = (typeof NODE_SLICE_METHOD_ENCODINGS)[keyof typeof NODE_SLICE_METHOD_ENCODINGS]

type NodeSliceMethodName = keyof typeof NODE_SLICE_METHOD_ENCODINGS

type NodeSliceMethod = (this: Buffer, start?: number, end?: number) => string

type PatchableBufferPrototype = Partial<Record<NodeSliceMethodName, NodeSliceMethod>>

const NODE_SLICE_METHOD_NAMES = Object.keys(NODE_SLICE_METHOD_ENCODINGS) as NodeSliceMethodName[]

export const installNodeBufferSliceMethods = {
  _toNodeSliceMethod(encoding: NodeSliceEncoding): NodeSliceMethod {
    return function (this: Buffer, start?: number, end?: number): string {
      return this.toString(encoding, start ?? 0, end ?? this.length)
    }
  },

  install(bufferConstructor: typeof Buffer = Buffer): void {
    const prototype = bufferConstructor.prototype as unknown as PatchableBufferPrototype

    NODE_SLICE_METHOD_NAMES.forEach((methodName) => {
      if (prototype[methodName] !== undefined) {
        return
      }
      prototype[methodName] = installNodeBufferSliceMethods._toNodeSliceMethod(NODE_SLICE_METHOD_ENCODINGS[methodName])
    })
  },
}
