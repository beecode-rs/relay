import { Buffer } from 'buffer';

import { hostKeyLineUtil } from '@/services/ssh/host-key-line';

const toEd25519KeyBlob = (seed: string): Buffer => {
  const algorithm = Buffer.from('ssh-ed25519', 'utf8');
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(algorithm.length, 0);

  return Buffer.concat([lengthPrefix, algorithm, Buffer.from(seed, 'utf8')]);
};

describe('hostKeyLineUtil', () => {
  describe('toHostToken', () => {
    it('uses the bare host for the default port', () => {
      expect(hostKeyLineUtil.toHostToken({ host: 'example.com', port: 22 })).toBe('example.com');
    });

    it('brackets the host with a custom port', () => {
      expect(hostKeyLineUtil.toHostToken({ host: 'example.com', port: 2222 })).toBe('[example.com]:2222');
    });
  });

  describe('keyTypeOf', () => {
    it('reads the algorithm name from the key blob', () => {
      expect(hostKeyLineUtil.keyTypeOf({ key: toEd25519KeyBlob('seed') })).toBe('ssh-ed25519');
    });

    it('returns unknown for a truncated blob', () => {
      expect(hostKeyLineUtil.keyTypeOf({ key: Buffer.from([0x00, 0x00]) })).toBe('unknown');
    });
  });

  describe('toHostKeyLine', () => {
    it('renders the known_hosts format', () => {
      const key = toEd25519KeyBlob('seed');
      const line = hostKeyLineUtil.toHostKeyLine({ hostToken: 'example.com', key, keyType: 'ssh-ed25519' });

      expect(line).toBe(`example.com ssh-ed25519 ${key.toString('base64')}`);
    });
  });

  describe('toFingerprint', () => {
    it('renders the SHA256 base64 fingerprint', () => {
      const fingerprint = hostKeyLineUtil.toFingerprint({ key: toEd25519KeyBlob('seed') });

      expect(fingerprint.startsWith('SHA256:')).toBe(true);
      expect(fingerprint).toBe(hostKeyLineUtil.toFingerprint({ key: toEd25519KeyBlob('seed') }));
      expect(fingerprint).not.toBe(hostKeyLineUtil.toFingerprint({ key: toEd25519KeyBlob('other') }));
    });
  });

  describe('verify', () => {
    const key = toEd25519KeyBlob('seed');
    const hostToken = 'example.com';
    const acceptedHostKeys = [hostKeyLineUtil.toHostKeyLine({ hostToken, key, keyType: 'ssh-ed25519' })];

    it('accepts a matching stored key', () => {
      const decision = hostKeyLineUtil.verify({ acceptedHostKeys, hostToken, key });

      expect(decision.isValid).toBe(true);
    });

    it('reports an unknown host without a stored line', () => {
      const decision = hostKeyLineUtil.verify({ acceptedHostKeys, hostToken: 'other.com', key });

      expect(decision.isValid).toBe(false);
      if (!decision.isValid) {
        expect(decision.code).toBe('host-key-unknown');
        expect(decision.fingerprint.startsWith('SHA256:')).toBe(true);
        expect(decision.hostKeyLine.startsWith('other.com ssh-ed25519 ')).toBe(true);
      }
    });

    it('reports a changed key when the stored material differs', () => {
      const decision = hostKeyLineUtil.verify({
        acceptedHostKeys: [hostKeyLineUtil.toHostKeyLine({ hostToken, key, keyType: 'ssh-ed25519' })],
        hostToken,
        key: toEd25519KeyBlob('attacker'),
      });

      expect(decision.isValid).toBe(false);
      if (!decision.isValid) {
        expect(decision.code).toBe('host-key-changed');
      }
    });

    it('accepts an incomplete stored line for the host', () => {
      const decision = hostKeyLineUtil.verify({ acceptedHostKeys: ['example.com'], hostToken, key });

      expect(decision.isValid).toBe(true);
    });
  });
});
