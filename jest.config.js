module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  passWithNoTests: true,
  setupFiles: ['<rootDir>/jest/setup-expo-fetch.js'],
  setupFilesAfterEnv: ['<rootDir>/jest/setup-act-environment.js', '<rootDir>/jest/setup-async-storage.js'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/css-stub.js',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@resource/(.*)$': '<rootDir>/resource/$1',
    '^react-native-tcp-socket$': '<rootDir>/jest/tcp-socket-stub.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|micro-key-producer|micro-packed|@noble|@scure))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
