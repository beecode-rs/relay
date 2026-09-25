import { Buffer } from 'buffer';
import process from 'process';
import { TextDecoder as polyfillTextDecoder, TextEncoder as polyfillTextEncoder } from 'text-encoding-polyfill';

import { installCrypto } from '@/app-boot/install-crypto';
import { installNodeBufferSliceMethods } from '@/app-boot/install-node-buffer-slice-methods';
import { installNodeBufferSpecies } from '@/app-boot/install-node-buffer-species';
import { installNodeBufferWriteMethods } from '@/app-boot/install-node-buffer-write-methods';

const runtimeGlobals = globalThis as {
  TextDecoder?: typeof globalThis.TextDecoder;
  TextEncoder?: typeof globalThis.TextEncoder;
};

globalThis.Buffer = Buffer;
globalThis.process = process;

runtimeGlobals.TextDecoder ??= polyfillTextDecoder;
runtimeGlobals.TextEncoder ??= polyfillTextEncoder;

installCrypto.install();
const quickCryptoBuffer = (globalThis as { Buffer?: typeof Buffer }).Buffer;
globalThis.Buffer = Buffer;
installNodeBufferSliceMethods.install(Buffer);
installNodeBufferSpecies.install(Buffer);
installNodeBufferWriteMethods.install(Buffer);
if (quickCryptoBuffer !== undefined && quickCryptoBuffer !== Buffer) {
  installNodeBufferSliceMethods.install(quickCryptoBuffer);
  installNodeBufferSpecies.install(quickCryptoBuffer);
  installNodeBufferWriteMethods.install(quickCryptoBuffer);
}
