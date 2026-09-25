import {
  hostTokenOf,
  mergeAcceptedHostKey,
  serverProfileIdUtil,
  serverProfileValidator,
} from '@/services/connection/server-profile';

describe('serverProfileValidator', () => {
  describe('validateHost', () => {
    it('rejects an empty host', () => {
      expect(serverProfileValidator.validateHost('')).toBe('Host is required');
    });

    it('rejects a host with invalid characters', () => {
      expect(serverProfileValidator.validateHost('bad host!')).toBe(
        'Host may only contain letters, digits, dots, underscores and dashes'
      );
    });

    it('accepts a dotted host', () => {
      expect(serverProfileValidator.validateHost('box.example.com')).toBeNull();
    });
  });

  describe('validatePort', () => {
    it('rejects a non-integer port', () => {
      expect(serverProfileValidator.validatePort(22.5)).toBe('Port must be an integer between 1 and 65535');
    });

    it('rejects an out-of-range port', () => {
      expect(serverProfileValidator.validatePort(70000)).toBe('Port must be an integer between 1 and 65535');
    });

    it('accepts a valid port', () => {
      expect(serverProfileValidator.validatePort(2222)).toBeNull();
    });
  });

  describe('validateUsername', () => {
    it('rejects an empty username', () => {
      expect(serverProfileValidator.validateUsername('')).toBe('Username is required');
    });

    it('accepts a username', () => {
      expect(serverProfileValidator.validateUsername('deploy')).toBeNull();
    });
  });

  describe('validateSecrets', () => {
    it('requires a password for password auth without stored secrets', () => {
      expect(
        serverProfileValidator.validateSecrets({
          authMethod: 'password',
          hasStoredSecrets: false,
          secrets: {},
        })
      ).toBe('Password is required');
    });

    it('allows a blank password when stored secrets exist', () => {
      expect(
        serverProfileValidator.validateSecrets({
          authMethod: 'password',
          hasStoredSecrets: true,
          secrets: {},
        })
      ).toBeNull();
    });

    it('requires a key for key auth without stored secrets', () => {
      expect(
        serverProfileValidator.validateSecrets({
          authMethod: 'privateKey',
          hasStoredSecrets: false,
          secrets: {},
        })
      ).toBe('Private key is required');
    });

    it('allows an entered key without stored secrets', () => {
      expect(
        serverProfileValidator.validateSecrets({
          authMethod: 'privateKey',
          hasStoredSecrets: false,
          secrets: { privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----' },
        })
      ).toBeNull();
    });

    it('requires no secret for device key auth', () => {
      expect(
        serverProfileValidator.validateSecrets({
          authMethod: 'deviceKey',
          hasStoredSecrets: false,
          secrets: {},
        })
      ).toBeNull();
    });
  });
});

describe('serverProfileIdUtil', () => {
  it('generates a 32-character hex id', () => {
    expect(serverProfileIdUtil.generateId()).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('mergeAcceptedHostKey', () => {
  it('appends a new host key line', () => {
    expect(mergeAcceptedHostKey([], 'example.com ssh-ed25519 KEY')).toEqual(['example.com ssh-ed25519 KEY']);
  });

  it('replaces the line for the same host token', () => {
    const merged = mergeAcceptedHostKey(
      ['example.com ssh-ed25519 OLD', 'other.com ssh-ed25519 KEY'],
      'example.com ssh-rsa NEW'
    );

    expect(merged).toEqual(['other.com ssh-ed25519 KEY', 'example.com ssh-rsa NEW']);
  });
});

describe('hostTokenOf', () => {
  it('extracts the first token of a known_hosts line', () => {
    expect(hostTokenOf('[example.com]:2222 ssh-ed25519 KEY')).toBe('[example.com]:2222');
  });
});
