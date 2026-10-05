# Development

How to set up Relay for local development. See the [README](../../README.md) for an overview of the app.

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
git clone git@github.com:beecode-rs/relay.git
cd relay
pnpm install
pnpm android
```

`pnpm android` (or `pnpm ios`) builds and installs the development client on a connected device or emulator; `pnpm start` then starts the Metro dev server for it. Use `pnpm exec expo install <package>` instead of `pnpm add` so dependency versions stay SDK-compatible.

Web has no raw TCP sockets, so SSH on web goes through a local WebSocket relay:

```bash
pnpm relay                                      # ws://localhost:4022
EXPO_PUBLIC_SSH_RELAY_URL=ws://localhost:4022 pnpm web
```

Automated gates:

- `pnpm typecheck`: TypeScript, no emit
- `pnpm lint`: ESLint (expo lint)
- `pnpm test`: Jest (jest-expo preset, node environment)
- `pnpm dlx expo-doctor`: diagnose dependency and config issues
