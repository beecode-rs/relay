import { Buffer } from 'buffer';
import { createHash } from 'crypto';

import { constant } from '@/constants/constant';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

const KEY_TYPE_LENGTH_OFFSET = 4;

export type HostKeyDecision =
  | { code: 'host-key-changed'; fingerprint: string; hostKeyLine: string; isValid: false }
  | { code: 'host-key-unknown'; fingerprint: string; hostKeyLine: string; isValid: false }
  | { isValid: true };

export const hostKeyLineUtil = {
  keyMaterialOf(params: { hostKeyLine: string }): string {
    const { hostKeyLine } = params;

    return hostKeyLine.trim().split(/\s+/)[2] ?? '';
  },

  keyTypeOf(params: { key: Buffer }): string {
    const { key } = params;
    if (key.length <= KEY_TYPE_LENGTH_OFFSET) {
      return 'unknown';
    }
    const nameLength = key.readUInt32BE(0);
    const nameEnd = KEY_TYPE_LENGTH_OFFSET + nameLength;
    if (nameEnd > key.length) {
      return 'unknown';
    }

    return key.subarray(KEY_TYPE_LENGTH_OFFSET, nameEnd).toString('utf8');
  },

  toFingerprint(params: { key: Buffer }): string {
    const { key } = params;
    const digest = createHash('sha256').update(key).digest('base64');

    return `SHA256:${digest}`;
  },

  toHostKeyLine(params: { hostToken: string; key: Buffer; keyType: string }): string {
    const { hostToken, key, keyType } = params;

    return `${hostToken} ${keyType} ${key.toString('base64')}`;
  },

  toHostToken(params: Pick<SshConnectOptions, 'host' | 'port'>): string {
    const { host, port } = params;
    if (port === constant.server.defaultPort) {
      return host;
    }

    return `[${host}]:${String(port)}`;
  },

  verify(params: { acceptedHostKeys: string[]; hostToken: string; key: Buffer }): HostKeyDecision {
    const { acceptedHostKeys, hostToken, key } = params;
    const hostKeyLine = hostKeyLineUtil.toHostKeyLine({
      hostToken,
      key,
      keyType: hostKeyLineUtil.keyTypeOf({ key }),
    });
    const fingerprint = hostKeyLineUtil.toFingerprint({ key });
    const decisionBase = { fingerprint, hostKeyLine };
    const acceptedLine = acceptedHostKeys.find((line) => {
      return hostKeyLineUtil._toHostTokenOfLine({ hostKeyLine: line }) === hostToken;
    });
    if (acceptedLine === undefined) {
      return { ...decisionBase, code: 'host-key-unknown', isValid: false };
    }
    const acceptedMaterial = hostKeyLineUtil.keyMaterialOf({ hostKeyLine: acceptedLine });
    if (acceptedMaterial !== '' && acceptedMaterial !== hostKeyLineUtil.keyMaterialOf({ hostKeyLine })) {
      return { ...decisionBase, code: 'host-key-changed', isValid: false };
    }

    return { isValid: true };
  },

  _toHostTokenOfLine(params: { hostKeyLine: string }): string {
    const { hostKeyLine } = params;

    return hostKeyLine.trim().split(/\s+/)[0] ?? '';
  },
};
