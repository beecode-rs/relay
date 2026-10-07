# Architecture

How Relay's source is layered and how SSH works without native SSH code. See the [README](../../README.md) for an overview of the app and [development.md](development.md) for the daily workflow.

## Layering

An Expo app layered as expo-router screen controllers in `src/app` over feature screens in `src/features`, business services (connection and profile stores, the SSH shell client, terminal preferences, theming) in `src/services`, and the ssh2 npm package isolated behind a single `SshTerminalPort`. The RN/Node compatibility layer that makes pure-JS ssh2 work — `src/lib`, `src/__internal__/polyfill-stubs/`, `src/app-boot/` — mirrors the proven turnstone setup; do not edit it casually.

## How SSH works

SSH runs entirely in the JS runtime — there is no native SSH code. The app uses the pure-JS [`ssh2`](https://www.npmjs.com/package/ssh2) client (a setup ported from the `turnstone` project):

- `react-native-tcp-socket` provides raw TCP (Metro maps Node's `net` to it).
- `react-native-quick-crypto` provides Node-style `crypto`.
- `metro.config.js` swaps Node builtins (`fs`, `http`, `zlib`, …) for RN-safe stubs, replaces ssh2's WASM Poly1305 with a pure-BigInt implementation (`src/lib/ssh2-poly1305.ts`), and rewrites the quick-crypto entry point for Hermes.
- `src/app-boot/boot.ts` installs `Buffer`, `process`, and `TextEncoder`/`TextDecoder` globals with Node-compat Buffer patches (imported from `src/app/_layout.tsx`).
- `src/services/ssh/ssh2-shell-client.ts` opens an interactive `xterm-256color` PTY shell and implements the app's `SshTerminalPort` contract, including TOFU host-key verification (`SHA256:` fingerprints, known_hosts-format lines).

Because `react-native-tcp-socket` and `react-native-quick-crypto` are native modules, the app requires a **development build** (`pnpm ios` / `pnpm android`) — it cannot run in Expo Go.
