const unsupportedKeygenError = (operationName: string): Error => {
  return new Error(`ssh2 key generation is unavailable on this platform: ${operationName}`)
}

export const generateKeyPair = (..._args: unknown[]): never => {
  throw unsupportedKeygenError('generateKeyPair')
}

export const generateKeyPairSync = (..._args: unknown[]): never => {
  throw unsupportedKeygenError('generateKeyPairSync')
}
