# Development

How to set up Relay for local development. See the [README](../../README.md) for an overview of the app.

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
git clone git@github.com:beecode-rs/relay.git
cd relay
pnpm install
pnpm android-setup
```

All `android-*` scripts build and run the **dev** app (`Relay (dev)`, `com.milos.becode.rs.relay.dev`); production APKs come from the [tag-driven release pipeline](releasing.md) or the local `build:android-release` script — keep the dev and production flows separate.

- `pnpm android` starts the Metro dev server and opens the installed debug app on a connected device or emulator — edits reload on save. Neither builds nor installs anything.
- `pnpm android-setup` is the first-run command: it chains `android-build` → `android-install` → `android`, so it compiles the debug APK, installs it on the connected device, and launches it with Metro.
- `pnpm android-build` compiles the debug APK (`android/app/build/outputs/apk/debug/app-debug.apk`) without installing it. If the `android/` directory is missing (fresh clone), it first regenerates it via `android-rebuild`.
- `pnpm android-install` installs the last built debug APK on the connected device, without rebuilding.
- `pnpm android-rebuild` does a clean prebuild that regenerates the android project — run it when native dependencies or app config plugins change, then `pnpm android-setup` to rebuild, reinstall, and run.
- `pnpm ios` builds and installs the development client for iOS; `pnpm start` starts only the Metro dev server.

Use `pnpm exec expo install <package>` instead of `pnpm add` so dependency versions stay SDK-compatible.

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
