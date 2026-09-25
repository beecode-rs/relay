import { Buffer } from 'buffer'

type PatchableBufferConstructor = {
  prototype: unknown
  [Symbol.species]?: unknown
}

export const installNodeBufferSpecies = {
  install(bufferConstructor: PatchableBufferConstructor = Buffer): void {
    if (bufferConstructor[Symbol.species] !== undefined) {
      return
    }
    Object.defineProperty(bufferConstructor, Symbol.species, {
      configurable: true,
      enumerable: false,
      value: bufferConstructor,
      writable: false,
    })
  },
}
