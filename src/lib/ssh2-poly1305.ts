const BLOCK_BYTES = 16
const CLAMP_MASK = 0x0ffffffc0ffffffc0ffffffc0fffffffn
const MOD_2_128 = (1n << 128n) - 1n
const PRIME = (1n << 130n) - 5n
const TAG_BYTES = 16

export type Ssh2Poly1305AuthFn = (
  outPtr: number,
  segmentA: Uint8Array,
  segmentALength: number,
  segmentB: Uint8Array,
  segmentBLength: number,
  key: Uint8Array,
) => void

export type Ssh2Poly1305WasmLikeModule = {
  HEAPU8: Uint8Array
  _malloc: (bytes: number) => number
  cwrap: (functionName: string, returnType: null, argTypes: string[]) => Ssh2Poly1305AuthFn
}

type Poly1305Stream = {
  key: Uint8Array
  segmentA: Uint8Array
  segmentALength: number
  segmentB: Uint8Array
  segmentBLength: number
}

export const ssh2Poly1305 = {
  _countBlocks(params: Poly1305Stream): number {
    const totalBytes = params.segmentALength + params.segmentBLength

    return Math.ceil(totalBytes / BLOCK_BYTES)
  },

  _readBlock(params: Poly1305Stream, blockIndex: number): bigint {
    const totalBytes = params.segmentALength + params.segmentBLength
    const blockStart = blockIndex * BLOCK_BYTES
    const blockLength = Math.min(BLOCK_BYTES, totalBytes - blockStart)
    const blockSum = Array.from({ length: blockLength }, (_unused, byteIndex) => {
      return BigInt(this._readStreamByte(params, blockStart + byteIndex)) << BigInt(8 * byteIndex)
    }).reduce((sum, term) => {
      return sum + term
    }, 0n)

    return blockSum + (1n << BigInt(8 * blockLength))
  },

  _readLeBytes(bytes: Uint8Array, offset: number): bigint {
    return Array.from({ length: BLOCK_BYTES }, (_unused, index) => {
      return BigInt(bytes[offset + index]) << BigInt(8 * index)
    }).reduce((sum, term) => {
      return sum + term
    }, 0n)
  },

  _readMultiplier(key: Uint8Array): bigint {
    return this._readLeBytes(key, 0) & CLAMP_MASK
  },

  _readStreamByte(params: Poly1305Stream, absoluteIndex: number): number {
    if (absoluteIndex < params.segmentALength) {
      return params.segmentA[absoluteIndex]
    }

    return params.segmentB[absoluteIndex - params.segmentALength]
  },

  _writeLeBytes(value: bigint): Uint8Array {
    return Uint8Array.from({ length: TAG_BYTES }, (_unused, index) => {
      return Number((value >> BigInt(8 * index)) & 0xffn)
    })
  },

  computeTag(params: Poly1305Stream): Uint8Array {
    const multiplier = this._readMultiplier(params.key)
    const addend = this._readLeBytes(params.key, BLOCK_BYTES)
    const blockCount = this._countBlocks(params)
    const blockValues = Array.from({ length: blockCount }, (_unused, blockIndex) => {
      return this._readBlock(params, blockIndex)
    })
    const messageNumber = blockValues.reduce((acc, blockValue) => {
      return ((acc + blockValue) * multiplier) % PRIME
    }, 0n)

    return this._writeLeBytes((messageNumber + addend) & MOD_2_128)
  },

  createModule(): Promise<Ssh2Poly1305WasmLikeModule> {
    const heap = new Uint8Array(TAG_BYTES)
    const wasmLikeModule: Ssh2Poly1305WasmLikeModule = {
      _malloc: (_bytes: number) => {
        return 0
      },

      cwrap: (functionName: string, _returnType: null, _argTypes: string[]) => {
        if (functionName !== 'poly1305_auth') {
          throw new Error(`Unsupported ssh2 poly1305 wasm function: ${functionName}`)
        }

        return (outPtr, segmentA, segmentALength, segmentB, segmentBLength, key) => {
          const tag = ssh2Poly1305.computeTag({
            key,
            segmentA,
            segmentALength,
            segmentB,
            segmentBLength,
          })

          heap.set(tag, outPtr)
        }
      },
       
      HEAPU8: heap,
    }

    return Promise.resolve(wasmLikeModule)
  },
}
