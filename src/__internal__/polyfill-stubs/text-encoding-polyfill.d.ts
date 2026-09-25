declare module 'text-encoding-polyfill' {
  export const TextDecoder: typeof globalThis.TextDecoder
  export const TextEncoder: typeof globalThis.TextEncoder
}
