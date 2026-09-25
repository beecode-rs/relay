const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const stubPath = (name) => {
  return path.resolve(__dirname, 'src', '__internal__', 'polyfill-stubs', `${name}.ts`);
};

const nodeStubModules = {
  assert: stubPath('assert'),
  child_process: stubPath('child_process'),
  'cpu-features': stubPath('cpu-features'),
  crypto: stubPath('crypto'),
  dns: stubPath('dns'),
  fs: stubPath('fs'),
  http: stubPath('http'),
  https: stubPath('https'),
  path: stubPath('path'),
  tls: stubPath('tls'),
  zlib: stubPath('zlib'),
};

const nativeNodeModuleAliases = {
  net: 'react-native-tcp-socket',
  'safer-buffer': 'buffer',
  stream: 'stream-browserify',
};

const webNodeModuleAliases = {
  assert: stubPath('assert'),
  'cpu-features': stubPath('cpu-features'),
  crypto: 'crypto-browserify',
  dns: stubPath('dns'),
  fs: stubPath('fs'),
  http: stubPath('http'),
  https: stubPath('https'),
  net: stubPath('net'),
  path: stubPath('path'),
  stream: 'stream-browserify',
  tls: stubPath('tls'),
  zlib: stubPath('zlib'),
};

const isNativePlatform = (platform) => {
  return platform === 'android' || platform === 'ios';
};

const ssh2ModuleStubs = [
  { moduleSuffix: `${path.sep}ssh2${path.sep}lib${path.sep}agent.js`, stubPath: stubPath('ssh2-agent') },
  {
    moduleSuffix: `${path.sep}ssh2${path.sep}lib${path.sep}http-agents.js`,
    stubPath: stubPath('ssh2-http-agents'),
  },
  { moduleSuffix: `${path.sep}ssh2${path.sep}lib${path.sep}keygen.js`, stubPath: stubPath('ssh2-keygen') },
  {
    moduleSuffix: `${path.sep}ssh2${path.sep}lib${path.sep}protocol${path.sep}crypto${path.sep}poly1305.js`,
    nativeOnly: true,
    stubPath: stubPath('ssh2-poly1305'),
  },
];

const findSsh2ModuleStubPath = (resolvedFilePath, platform) => {
  const matchingStub = ssh2ModuleStubs.find((entry) => {
    if (entry.nativeOnly === true && !isNativePlatform(platform)) {
      return false;
    }
    return typeof resolvedFilePath === 'string' && resolvedFilePath.endsWith(entry.moduleSuffix);
  });
  return matchingStub?.stubPath;
};

const quickCryptoSourceEntrySuffix = `${path.sep}react-native-quick-crypto${path.sep}src${path.sep}index.ts`;
const quickCryptoCommonjsEntrySuffix = `${path.sep}react-native-quick-crypto${path.sep}lib${path.sep}commonjs${path.sep}index.js`;

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isNativePlatform(platform)) {
    if (nodeStubModules[moduleName]) {
      return { filePath: nodeStubModules[moduleName], type: 'sourceFile' };
    }
    if (nativeNodeModuleAliases[moduleName]) {
      return context.resolveRequest(context, nativeNodeModuleAliases[moduleName], platform);
    }
  }
  if (platform === 'web' && webNodeModuleAliases[moduleName]) {
    return context.resolveRequest(context, webNodeModuleAliases[moduleName], platform);
  }

  const resolveRequestFn = defaultResolveRequest ?? context.resolveRequest;
  const resolution = resolveRequestFn(context, moduleName, platform);

  if (
    resolution?.type === 'sourceFile' &&
    typeof resolution.filePath === 'string' &&
    resolution.filePath.endsWith(quickCryptoSourceEntrySuffix)
  ) {
    return {
      filePath: resolution.filePath.replace(quickCryptoSourceEntrySuffix, quickCryptoCommonjsEntrySuffix),
      type: 'sourceFile',
    };
  }

  const resolvedSsh2StubPath = findSsh2ModuleStubPath(resolution?.filePath, platform);
  if (resolution?.type === 'sourceFile' && resolvedSsh2StubPath) {
    return { filePath: resolvedSsh2StubPath, type: 'sourceFile' };
  }
  return resolution;
};

module.exports = config;
