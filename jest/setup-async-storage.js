// AsyncStorage throws at import time when its native module is absent (jest
// node env). Swap in the official in-memory mock, per the library's jest docs:
// https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock('@react-native-async-storage/async-storage', () => {
  return require('@react-native-async-storage/async-storage/jest/async-storage-mock');
});
