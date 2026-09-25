// Expo SDK 57 installs a lazy global `fetch` getter (expo/src/winter/
// runtime.native.ts). When first read after a suite has finished — a
// post-teardown continuation in a worker — the getter's require chain
// console.warns through expo-modules-core, and jest turns "Cannot log after
// tests are done" into exit code 1 even with every test passing. Keep the
// environment's own fetch instead via expo's official escape hatch; nothing
// in the test suite fetches. Must run in `setupFiles` (before any expo
// import arms the getter).
process.env.EXPO_PUBLIC_USE_RN_FETCH = '1'
