This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

This project uses **pnpm** (`pnpm-lock.yaml`; `.npmrc` sets `node-linker=hoisted` for React Native compatibility). Always use pnpm instead of npm/npx/yarn/bun:

```bash
pnpm exec expo install <package>  # ALWAYS use instead of pnpm add — resolves SDK-compatible versions
pnpm start                # start the dev server
pnpm lint                 # lint (expo lint)
pnpm typecheck            # typecheck (tsc --noEmit)
pnpm test                 # jest (jest-expo preset, node environment)
pnpm dlx expo-doctor      # diagnose dependency and config issues
pnpm exec expo install --fix  # fix incompatible package versions
```

Run lint, typecheck, and test before declaring any task done.

## Jest config is load-bearing

`jest.config.js` `moduleNameMapper` **replaces** jest-expo's tsconfig-derived alias map. Keep all four entries when editing it: the `\.css$` stub (must stay **first** — mapper entries apply in order and `^@/(.*)$` would otherwise shadow `@/global.css`), `^@/(.*)$`, `^@/assets/(.*)$`, and `^react-native-tcp-socket$` (the jest stub in `jest/tcp-socket-stub.js`; the real module is native-only and the SSH stack imports it transitively).

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `pnpm dlx eas-cli <command>`; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- Destructive UI actions (remove/delete) must ask the user to confirm before executing — e.g. `Alert.alert` with a cancel option and a destructive confirm button.
- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `pnpm ios` / `pnpm android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
