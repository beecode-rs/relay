export const nodeCryptoAlgorithmNames = {
  toNodeNames(params: { names: string[] }): string[] {
    return params.names.map((name) => {
      return name.toLowerCase()
    })
  },
}
