import type { DeviceKeyInfo } from '@/services/connection/device-key';
import { deviceKeyService } from '@/services/connection/device-key';
import { serverConnectOptions } from '@/services/connection/connect-options';
import type { ServerProfile, ServerProfileSecrets } from '@/services/connection/server-profile';

const mock = {
  lastSessionName: null as string | null,
  profile: null as ServerProfile | null,
  secrets: null as ServerProfileSecrets | null,
};

jest.mock('@/services/connection/credential-store', () => {
  return {
    serverCredentialStore: {
      find: jest.fn(async () => {
        return mock.secrets;
      }),
    },
  };
});

jest.mock('@/services/connection/server-last-session-store', () => {
  return {
    serverLastSessionStore: {
      find: jest.fn(async () => {
        return mock.lastSessionName;
      }),
    },
  };
});

jest.mock('@/services/connection/device-key', () => {
  return { deviceKeyService: { find: jest.fn(), getOrCreate: jest.fn() } };
});

jest.mock('@/services/connection/server-profile-store', () => {
  return {
    serverProfileStore: {
      findById: jest.fn(async () => {
        return mock.profile;
      }),
    },
  };
});

const toProfile = (authMethod: ServerProfile['authMethod']): ServerProfile => {
  return {
    acceptedHostKeys: ['example.com ssh-ed25519 KEY'],
    authMethod,
    host: 'example.com',
    id: 'server-1',
    label: 'Example',
    port: 2222,
    remotePath: '/srv/app',
    tmuxPrefix: 'abc123',
    username: 'user',
  };
};

const mockDeviceKeyInfo: DeviceKeyInfo = {
  comment: 'beecode@ios-1a2b3c',
  createdAt: '2026-01-01T00:00:00.000Z',
  fingerprint: 'SHA256:mock-device-key',
  privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----MOCK-----END OPENSSH PRIVATE KEY-----',
  publicKey: 'ssh-ed25519 AAAAMOCKDEVICEKEYBLOB beecode@ios-1a2b3c',
};

beforeEach(() => {
  mock.profile = null;
  mock.secrets = null;
  mock.lastSessionName = null;
  jest.mocked(deviceKeyService.find).mockReset();
  jest.mocked(deviceKeyService.getOrCreate).mockReset();
});

describe('serverConnectOptions', () => {
  it('resolves a device key profile to private key auth', async () => {
    mock.profile = toProfile('deviceKey');
    jest.mocked(deviceKeyService.find).mockResolvedValue(mockDeviceKeyInfo);

    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toEqual({
      acceptedHostKeys: ['example.com ssh-ed25519 KEY'],
      auth: { kind: 'privateKey', privateKey: mockDeviceKeyInfo.privateKey },
      cols: 80,
      host: 'example.com',
      label: 'Example',
      port: 2222,
      remotePath: '/srv/app',
      rows: 24,
      username: 'user',
    });
  });

  it('returns null and warns when the device key is unavailable', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mock.profile = toProfile('deviceKey');
      jest.mocked(deviceKeyService.find).mockRejectedValue(new Error('keychain locked'));

      await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('[device-key] unavailable for connect:', expect.any(Error));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns null when the device key was removed without regenerating one', async () => {
    mock.profile = toProfile('deviceKey');
    jest.mocked(deviceKeyService.find).mockResolvedValue(null);

    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toBeNull();
    expect(deviceKeyService.getOrCreate).not.toHaveBeenCalled();
  });

  it('keeps password auth unchanged', async () => {
    mock.profile = toProfile('password');
    mock.secrets = { password: 'secret' };

    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toMatchObject({
      auth: { kind: 'password', password: 'secret' },
      host: 'example.com',
      port: 2222,
    });
  });

  it('keeps private key auth unchanged', async () => {
    mock.profile = toProfile('privateKey');
    mock.secrets = { passphrase: 'phrase', privateKey: '-----KEY-----' };

    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toMatchObject({
      auth: { kind: 'privateKey', passphrase: 'phrase', privateKey: '-----KEY-----' },
    });
  });

  it('returns null for a missing profile', async () => {
    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toBeNull();
  });

  it('includes the remembered tmux session for the next connect', async () => {
    mock.profile = toProfile('password');
    mock.secrets = { password: 'secret' };
    mock.lastSessionName = 'work-abc123';

    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toMatchObject({
      lastTmuxSessionName: 'work-abc123',
    });
  });

  it('omits the remembered tmux session when none is stored', async () => {
    mock.profile = toProfile('password');
    mock.secrets = { password: 'secret' };

    await expect(serverConnectOptions.build({ id: 'server-1' })).resolves.toMatchObject({
      lastTmuxSessionName: undefined,
    });
  });
});
