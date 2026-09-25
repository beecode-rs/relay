import { getCiphers as quickCryptoGetCiphers, getHashes as quickCryptoGetHashes } from 'react-native-quick-crypto'

import { nodeCryptoAlgorithmNames } from '@/lib/node-crypto-algorithm-names'

export * from 'react-native-quick-crypto'

export function getCiphers(): string[] {
  return nodeCryptoAlgorithmNames.toNodeNames({ names: quickCryptoGetCiphers() })
}

export function getHashes(): string[] {
  return nodeCryptoAlgorithmNames.toNodeNames({ names: quickCryptoGetHashes() })
}
