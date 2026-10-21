# Development

How to set up Relay for local development. See the [README](../../README.md) for an overview of the app.

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
git clone git@github.com:beecode-rs/relay.git
cd relay
pnpm install
pnpm android-rebuild && pnpm android-release
```

`pnpm android` starts the Metro dev server and opens the installed development client on a connected device or emulator (`pnpm start` starts only the Metro dev server) — neither builds anything. `pnpm ios` still builds and installs the development client for iOS. `pnpm android-rebuild` does a clean prebuild that regenerates the android project, without building or installing it. `pnpm android-install` re-installs the last built debug APK after an uninstall, without rebuilding. `pnpm android-release` builds, installs, and launches the release variant on Android. Use `pnpm exec expo install <package>` instead of `pnpm add` so dependency versions stay SDK-compatible.

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
