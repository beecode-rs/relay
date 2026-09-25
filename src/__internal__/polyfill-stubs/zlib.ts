 
class ZlibEngine {
  constructor(_mode?: unknown) {
    throw new Error('ssh2 zlib compression is unavailable on this platform')
  }
}

const createInflate = (): { _handle: { constructor: typeof ZlibEngine } } => {
  return { _handle: { constructor: ZlibEngine } }
}

export const constants = {
  DEFLATE: 1,
  INFLATE: 2,
  Z_DEFAULT_CHUNK: 16384,
  Z_DEFAULT_COMPRESSION: -1,
  Z_DEFAULT_MEMLEVEL: 8,
  Z_DEFAULT_STRATEGY: 0,
  Z_DEFAULT_WINDOWBITS: 15,
  Z_PARTIAL_FLUSH: 1,
}

export { createInflate }
