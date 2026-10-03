import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ServerFormScreen } from '@/features/servers/server-form-screen';
import { deviceKeyService } from '@/services/connection/device-key';
import type { ServerCredentialStore } from '@/services/connection/credential-store';
import type { DeviceKeyInfo } from '@/services/connection/device-key';
import type { ServerProfile, ServerProfileSecrets } from '@/services/connection/server-profile';
import type { ServerProfileStore } from '@/services/connection/server-profile-store';
import type { SshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import type {
  SshBridgeError,
  SshBridgeEventName,
  SshBridgeEventSubscription,
  SshBridgeNativeEvents,
  SshConnectOptions,
  SshExecResult,
  SshRemoteDirEntry,
} from '@/services/terminal/ssh-terminal-types';

jest.mock('expo-router', () => {
  return { router: { back: jest.fn() } };
});

jest.mock('react-native-keyboard-controller', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('react-native-keyboard-controller/jest');
});

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('react-native-safe-area-context/jest/mock').default;
});

const mockDeviceKeyInfo: DeviceKeyInfo = {
  comment: 'beecode@ios-1a2b3c',
  createdAt: '2026-01-01T00:00:00.000Z',
  fingerprint: 'SHA256:mock-device-key',
  privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----MOCK-----END OPENSSH PRIVATE KEY-----',
  publicKey: 'ssh-ed25519 AAAAMOCKDEVICEKEYBLOB beecode@ios-1a2b3c',
};

jest.mock('@/services/connection/device-key', () => {
  return {
    deviceKeyService: {
      find: jest.fn(),
      getOrCreate: jest.fn(),
      regenerate: jest.fn(),
      remove: jest.fn(),
    },
  };
});

type SavedEntry = { profile: ServerProfile; secrets?: ServerProfileSecrets };

const createStore = () => {
  const entries: SavedEntry[] = [];
  const store: ServerProfileStore = {
    async findById({ id }) {
      return (
        entries.find((entry) => {
          return entry.profile.id === id;
        })?.profile ?? null
      );
    },
    async list() {
      return entries.map((entry) => {
        return entry.profile;
      });
    },
    async migrateLegacyProfile() {},
    async remove({ id }) {
      const withoutMatch = entries.filter((entry) => {
        return entry.profile.id !== id;
      });
      entries.splice(0, entries.length, ...withoutMatch);
    },
    async save(params) {
      const withoutMatch = entries.filter((entry) => {
        return entry.profile.id !== params.profile.id;
      });
      entries.splice(0, entries.length, ...withoutMatch, { profile: params.profile, secrets: params.secrets });
    },
  };

  return { entries, store };
};

const createCredentialStore = (secrets: ServerProfileSecrets | null = null) => {
  const store: ServerCredentialStore = {
    async find() {
      return secrets;
    },
    async remove() {},
    async save() {},
  };

  return store;
};

type FakeTestClient = SshTerminalPort & {
  connectCalls: SshConnectOptions[];
  disconnectCount: number;
  execCalls: string[];
  readDirCalls: { path: string }[];
  failNextConnect(failure: Partial<SshBridgeError> & { message: string }): void;
  queueReadDirEntries(entries: SshRemoteDirEntry[] | Error): void;
};

type FakeExecImpl = (command: string) => Promise<SshExecResult>;

const createTestClientFactory = () => {
  const clients: FakeTestClient[] = [];
  const pending = {
    execImpl: null as FakeExecImpl | null,
    failure: null as SshBridgeError | null,
    readDirEntries: null as SshRemoteDirEntry[] | Error | null,
  };
  const toBridgeFailure = (failure: Partial<SshBridgeError> & { message: string }): SshBridgeError => {
    const error = new Error(failure.message) as SshBridgeError;
    error.code = failure.code ?? 'unknown';
    if (failure.fingerprint !== undefined) {
      error.fingerprint = failure.fingerprint;
    }
    if (failure.hostKeyLine !== undefined) {
      error.hostKeyLine = failure.hostKeyLine;
    }

    return error;
  };
  const factory = (): SshTerminalPort => {
    const next = { execImpl: pending.execImpl, failure: pending.failure };
    pending.execImpl = null;
    pending.failure = null;
    const readDirQueue: (SshRemoteDirEntry[] | Error)[] = [];
    if (pending.readDirEntries !== null) {
      readDirQueue.push(pending.readDirEntries);
      pending.readDirEntries = null;
    }
    const client: FakeTestClient = {
      connectCalls: [],
      disconnectCount: 0,
      execCalls: [],
      readDirCalls: [],
      failNextConnect(failure) {
        next.failure = toBridgeFailure(failure);
      },
      isSupported: true,
      async connect(options) {
        this.connectCalls.push(options);
        if (next.failure !== null) {
          const failure = next.failure;
          next.failure = null;
          throw failure;
        }
      },
      async exec(command) {
        this.execCalls.push(command);
        if (next.execImpl !== null) {
          const execImpl = next.execImpl;
          next.execImpl = null;

          return execImpl(command);
        }

        return { exitCode: 0, stderr: '', stdout: '' };
      },
      async runInLoginShell() {},
      async readDir(params) {
        this.readDirCalls.push({ path: params.path });
        const queued = readDirQueue.shift();
        if (queued === undefined) {
          return [];
        }
        if (queued instanceof Error) {
          throw queued;
        }

        return queued;
      },
      queueReadDirEntries(entries) {
        readDirQueue.push(entries);
      },
      async resize() {},
      async write() {},
      disconnect() {
        this.disconnectCount += 1;
      },
      addListener<E extends SshBridgeEventName>(
        _eventName: E,
        _listener: SshBridgeNativeEvents[E]
      ): SshBridgeEventSubscription {
        return { remove: () => {} };
      },
      removeListeners() {},
    };
    clients.push(client);

    return client;
  };

  return {
    armNextClient(failure: Partial<SshBridgeError> & { message: string }): void {
      pending.failure = toBridgeFailure(failure);
    },
    armNextClientExec(execImpl: FakeExecImpl): void {
      pending.execImpl = execImpl;
    },
    armNextClientReadDir(entries: SshRemoteDirEntry[] | Error): void {
      pending.readDirEntries = entries;
    },
    clients,
    factory,
  };
};

const fillNewServerForm = async () => {
  await fireEvent.changeText(screen.getByPlaceholderText('host'), 'example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('username'), 'user');
  await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
};

beforeEach(() => {
  jest.mocked(router.back).mockClear();
});

describe('ServerFormScreen (add)', () => {
  it('renders the add title for a new server', async () => {
    await render(<ServerFormScreen store={createStore().store} credentialStore={createCredentialStore()} />);

    expect(screen.getByText('Add Instance')).toBeTruthy();
  });

  it('saves the profile with entered secrets and navigates back', async () => {
    const { entries, store } = createStore();
    await render(<ServerFormScreen store={store} credentialStore={createCredentialStore()} />);

    await fillNewServerForm();
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].profile).toMatchObject({ host: 'example.com', port: 22, username: 'user' });
    expect(entries[0].secrets).toEqual({ password: 'secret' });
  });

  it('shows validation errors without saving when the host is invalid', async () => {
    const { entries, store } = createStore();
    await render(<ServerFormScreen store={store} credentialStore={createCredentialStore()} />);

    await fireEvent.changeText(screen.getByPlaceholderText('host'), 'bad host!');

    await waitFor(() => {
      expect(
        screen.getByText('Host may only contain letters, digits, dots, underscores and dashes')
      ).toBeTruthy();
    });
    expect(entries).toHaveLength(0);
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('ServerFormScreen (edit)', () => {
  const profile: ServerProfile = {
    acceptedHostKeys: [],
    authMethod: 'password',
    host: 'example.com',
    id: 'server-1',
    label: 'Example',
    port: 22,
    tmuxPrefix: 'abc123',
    username: 'user',
  };

  it('prefills from the stored profile and keeps stored secrets when blank', async () => {
    const { entries, store } = createStore();
    await store.save({ profile, secrets: { password: 'stored' } });
    await render(<ServerFormScreen profileId="server-1" store={store} credentialStore={createCredentialStore({ password: 'stored' })} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('example.com')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].secrets).toBeUndefined();
  });

  it('prefills the stored remote path', async () => {
    const { store } = createStore();
    await store.save({ profile: { ...profile, remotePath: '/srv/app' }, secrets: { password: 'stored' } });
    await render(
      <ServerFormScreen profileId="server-1" store={store} credentialStore={createCredentialStore({ password: 'stored' })} />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('/srv/app')).toBeTruthy();
    });
  });

  it('keeps the stored session id on save without showing it', async () => {
    const { entries, store } = createStore();
    await store.save({ profile, secrets: { password: 'stored' } });
    await render(
      <ServerFormScreen profileId="server-1" store={store} credentialStore={createCredentialStore({ password: 'stored' })} />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('example.com')).toBeTruthy();
    });
    expect(screen.queryByTestId('server-tmux-prefix-input')).toBeNull();
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].profile.tmuxPrefix).toBe('abc123');
  });

  it('clears the remote path when the field is emptied', async () => {
    const { entries, store } = createStore();
    await store.save({ profile: { ...profile, remotePath: '/srv/app' }, secrets: { password: 'stored' } });
    await render(
      <ServerFormScreen profileId="server-1" store={store} credentialStore={createCredentialStore({ password: 'stored' })} />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('/srv/app')).toBeTruthy();
    });
    await fireEvent.changeText(screen.getByDisplayValue('/srv/app'), '');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].profile.remotePath).toBeUndefined();
  });
});

describe('ServerFormScreen session id', () => {
  it('saves a generated session id with a new profile without rendering a field for it', async () => {
    const { entries, store } = createStore();
    await render(<ServerFormScreen store={store} credentialStore={createCredentialStore()} />);

    expect(screen.queryByTestId('server-tmux-prefix-input')).toBeNull();
    await fillNewServerForm();
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].profile.tmuxPrefix).toMatch(/^[a-f0-9]{6}$/);
  });
});

describe('ServerFormScreen (clone)', () => {
  const source: ServerProfile = {
    acceptedHostKeys: ['example.com ssh-ed25519 KEY'],
    authMethod: 'password',
    host: 'example.com',
    id: 'server-1',
    label: 'Example',
    port: 2222,
    tmuxPrefix: 'abc123',
    username: 'user',
  };

  it('prefills the cloned fields with a copied label and a fresh session id', async () => {
    const { store } = createStore();
    await store.save({ profile: source, secrets: { password: 'stored' } });
    await render(
      <ServerFormScreen cloneSourceId="server-1" store={store} credentialStore={createCredentialStore()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Add Instance')).toBeTruthy();
      expect(screen.getByDisplayValue('Example (copy)')).toBeTruthy();
    });
    expect(screen.getByDisplayValue('example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('2222')).toBeTruthy();
    expect(screen.getByDisplayValue('user')).toBeTruthy();
  });

  it('saves a new profile that reuses the stored credentials when secrets are blank', async () => {
    const { entries, store } = createStore();
    await store.save({ profile: source, secrets: { password: 'stored' } });
    await render(
      <ServerFormScreen
        cloneSourceId="server-1"
        store={store}
        credentialStore={createCredentialStore({ password: 'stored' })}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Example (copy)')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries).toHaveLength(2);
    expect(entries[1].profile).toMatchObject({
      host: 'example.com',
      id: expect.not.stringMatching('server-1'),
      label: 'Example (copy)',
      port: 2222,
      tmuxPrefix: expect.not.stringMatching('abc123'),
      username: 'user',
    });
    expect(entries[1].secrets).toEqual({ password: 'stored' });
  });
});

describe('ServerFormScreen remote path', () => {
  it('saves a normalized remote path', async () => {
    const { entries, store } = createStore();
    await render(<ServerFormScreen store={store} credentialStore={createCredentialStore()} />);

    await fillNewServerForm();
    await fireEvent.changeText(screen.getByPlaceholderText('/'), 'home/user/');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].profile.remotePath).toBe('/home/user');
  });

  it('opens the folder browser, navigates and writes the chosen folder into the field', async () => {
    const { armNextClientReadDir, clients, factory } = createTestClientFactory();
    armNextClientReadDir([{ isDirectory: true, name: 'srv' }]);
    await render(
      <ServerFormScreen store={createStore().store} credentialStore={createCredentialStore()} createTestClient={factory} />
    );

    await fillNewServerForm();
    await fireEvent.press(screen.getByLabelText('Browse remote folders'));
    await screen.findByText('srv');
    clients[0].queueReadDirEntries([{ isDirectory: true, name: 'app' }]);
    await fireEvent.press(screen.getByText('srv'));
    await fireEvent.press(await screen.findByText('app'));
    await fireEvent.press(screen.getByText('Use this folder'));

    expect(screen.getByDisplayValue('/srv/app')).toBeTruthy();
    expect(clients[0].readDirCalls).toEqual([{ path: '/' }, { path: '/srv' }, { path: '/srv/app' }]);
  });

  it('routes browse host-key failures to the host key dialog', async () => {
    const { armNextClient, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen store={createStore().store} credentialStore={createCredentialStore()} createTestClient={factory} />
    );

    await fillNewServerForm();
    armNextClient({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
      message: 'Host verification failed',
    });
    await fireEvent.press(screen.getByLabelText('Browse remote folders'));

    await waitFor(() => {
      expect(screen.getByTestId('host-key-dialog')).toBeTruthy();
    });
    expect(screen.queryByTestId('folder-browser-modal')).toBeNull();
  });
});

describe('ServerFormScreen test connection', () => {
  it('reports a successful test and disconnects the client', async () => {
    const { clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillNewServerForm();
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(clients[0].connectCalls).toHaveLength(1);
    expect(clients[0].disconnectCount).toBe(1);
  });

  it('shows the failure message for a rejected connection', async () => {
    const { armNextClient, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillNewServerForm();
    armNextClient({ code: 'auth', message: 'All configured authentication methods failed' });
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed: All configured authentication methods failed')).toBeTruthy();
    });
  });

  it('accepts an unknown host key and retries with the accepted line', async () => {
    const { clients, armNextClient, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillNewServerForm();
    armNextClient({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
      message: 'Host verification failed',
    });
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByTestId('host-key-dialog')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(clients[1].connectCalls[0].acceptedHostKeys).toEqual(['example.com ssh-ed25519 NEWKEY']);
  });

  it('stops testing after rejecting the host key', async () => {
    const { armNextClient, clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillNewServerForm();
    armNextClient({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
      message: 'Host verification failed',
    });
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByTestId('host-key-dialog')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Reject'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed: Host key was rejected')).toBeTruthy();
    });
    expect(clients).toHaveLength(1);
  });

  it('retries with the current password after accepting the host key', async () => {
    const { armNextClient, clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fireEvent.changeText(screen.getByPlaceholderText('host'), 'example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('username'), 'user');
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'sec');
    armNextClient({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
      message: 'Host verification failed',
    });
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByTestId('host-key-dialog')).toBeTruthy();
    });
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(clients[1].connectCalls[0].auth).toEqual({ kind: 'password', password: 'secret' });
  });
});

describe('ServerFormScreen device key', () => {
  beforeEach(() => {
    jest.mocked(deviceKeyService.find).mockReset();
    jest.mocked(deviceKeyService.find).mockResolvedValue(mockDeviceKeyInfo);
    jest.mocked(deviceKeyService.getOrCreate).mockReset();
  });

  const fillBaseFields = async () => {
    await fireEvent.changeText(screen.getByPlaceholderText('host'), 'example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('username'), 'user');
  };

  const selectDeviceKey = async () => {
    await fireEvent.press(screen.getByText('Device key'));
  };

  const waitForDeviceKeyReady = async () => {
    await waitFor(() => {
      expect(screen.getByTestId('device-key-authenticate-button').props.accessibilityState.disabled).toBe(false);
    });
  };

  const openInstallModal = async () => {
    await fireEvent.press(screen.getByText('Authenticate Device Key with Instance'));
    await screen.findByTestId('device-key-install-modal');
  };

  it('selects the device key chip, keeps key details out of the form and saves without secret inputs', async () => {
    const { entries, store } = createStore();
    await render(<ServerFormScreen store={store} credentialStore={createCredentialStore()} />);

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();

    expect(deviceKeyService.find).toHaveBeenCalledTimes(1);
    expect(deviceKeyService.getOrCreate).not.toHaveBeenCalled();
    expect(screen.queryByText(mockDeviceKeyInfo.fingerprint)).toBeNull();
    expect(screen.queryByText(mockDeviceKeyInfo.comment)).toBeNull();
    expect(screen.queryByPlaceholderText('password')).toBeNull();
    expect(screen.queryByPlaceholderText('passphrase')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].profile.authMethod).toBe('deviceKey');
    expect(entries[0].secrets).toEqual({});
  });

  it('wipes stored secrets when an edited profile switches to device key', async () => {
    const profile: ServerProfile = {
      acceptedHostKeys: [],
      authMethod: 'password',
      host: 'example.com',
      id: 'server-1',
      label: 'Example',
      port: 22,
      tmuxPrefix: 'abc123',
      username: 'user',
    };
    const { entries, store } = createStore();
    await store.save({ profile, secrets: { password: 'stored' } });
    await render(
      <ServerFormScreen
        profileId="server-1"
        store={store}
        credentialStore={createCredentialStore({ password: 'stored' })}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('example.com')).toBeTruthy();
    });
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(entries[0].profile.authMethod).toBe('deviceKey');
    expect(entries[0].secrets).toEqual({});
  });

  it('shows a hint and disables key actions when no device key exists', async () => {
    jest.mocked(deviceKeyService.find).mockResolvedValue(null);
    const { entries, store } = createStore();
    await render(<ServerFormScreen store={store} credentialStore={createCredentialStore()} />);

    await fillBaseFields();
    await selectDeviceKey();

    await waitFor(() => {
      expect(screen.getByText('No device key on this device yet. Generate one in Settings > SSH Key.')).toBeTruthy();
    });
    expect(deviceKeyService.getOrCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('device-key-authenticate-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Test Connection' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByText('Save'));

    expect(entries).toHaveLength(0);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows an error when the device key cannot be read', async () => {
    jest.mocked(deviceKeyService.find).mockRejectedValue(new Error('keychain locked'));
    await render(<ServerFormScreen store={createStore().store} credentialStore={createCredentialStore()} />);

    await fillBaseFields();
    await selectDeviceKey();

    await waitFor(() => {
      expect(screen.getByText('Device key unavailable: keychain locked')).toBeTruthy();
    });
  });

  it('opens the install modal after the server rejects the device key', async () => {
    const { armNextClient, clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    armNextClient({ code: 'auth', message: 'All configured authentication methods failed' });
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed: All configured authentication methods failed')).toBeTruthy();
    });
    expect(clients[0].connectCalls[0].auth).toEqual({
      kind: 'privateKey',
      privateKey: mockDeviceKeyInfo.privateKey,
    });

    await openInstallModal();
  });

  it('installs the key with the password and re-runs the test automatically', async () => {
    const { clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(clients).toHaveLength(2);
    expect(clients[0].connectCalls[0].auth).toEqual({ kind: 'password', password: 'secret' });
    expect(clients[0].execCalls[0]).toContain('authorized_keys');
    expect(clients[0].execCalls[0]).toContain(mockDeviceKeyInfo.publicKey);
    expect(clients[1].connectCalls[0].auth).toEqual({
      kind: 'privateKey',
      privateKey: mockDeviceKeyInfo.privateKey,
    });
    expect(screen.queryByTestId('device-key-install-modal')).toBeNull();
  });

  it('disconnects the client when the install command fails', async () => {
    const { armNextClientExec, clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    armNextClientExec(() => {
      return Promise.reject(new Error('Remote command timed out after 10000ms'));
    });
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByText('Key install failed: Remote command timed out after 10000ms')).toBeTruthy();
    });
    expect(clients[0].execCalls).toHaveLength(1);
    expect(clients[0].disconnectCount).toBe(1);
    expect(screen.getByTestId('device-key-install-modal')).toBeTruthy();
  });

  it('treats a zero-exit install with stderr as successful', async () => {
    const { armNextClientExec, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    armNextClientExec(async () => {
      return { exitCode: 0, stderr: 'restorecon: warning', stdout: '' };
    });
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(screen.queryByText(/Key install failed/)).toBeNull();
  });

  it('closes the install modal once the key verifies', async () => {
    const { factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(screen.queryByTestId('device-key-install-modal')).toBeNull();
    expect(screen.queryByPlaceholderText('password')).toBeNull();
  });

  it('re-opens the install modal without the stale verifying note when verification still fails', async () => {
    const { armNextClient, armNextClientExec, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    armNextClientExec(async () => {
      armNextClient({ code: 'auth', message: 'All configured authentication methods failed' });

      return { exitCode: 0, stderr: '', stdout: '' };
    });
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed: All configured authentication methods failed')).toBeTruthy();
    });
    expect(screen.queryByTestId('device-key-install-modal')).toBeNull();

    await openInstallModal();

    expect(screen.queryByText(/Key installed — verifying/)).toBeNull();
    expect(screen.getByDisplayValue('secret')).toBeTruthy();
  });

  it('resumes the install with the current password after accepting the host key', async () => {
    const { armNextClient, clients, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'sec');
    armNextClient({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
      message: 'Host verification failed',
    });
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByTestId('host-key-dialog')).toBeTruthy();
    });
    expect(screen.getByTestId('device-key-install-modal')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    await fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeTruthy();
    });
    expect(clients[1].connectCalls[0].auth).toEqual({ kind: 'password', password: 'secret' });
    expect(clients[1].execCalls).toHaveLength(1);
  });

  it('reports a rejected host key as an install failure', async () => {
    const { armNextClient, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await selectDeviceKey();
    await waitForDeviceKeyReady();
    await openInstallModal();
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    armNextClient({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
      message: 'Host verification failed',
    });
    await fireEvent.press(screen.getByText('Install key on server'));

    await waitFor(() => {
      expect(screen.getByTestId('host-key-dialog')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Reject'));

    await waitFor(() => {
      expect(screen.getByText('Key install failed: Host key was rejected')).toBeTruthy();
    });
    expect(screen.queryByText('Connection failed: Host key was rejected')).toBeNull();
  });

  it('resets the connection failure when switching auth kind', async () => {
    const { armNextClient, factory } = createTestClientFactory();
    await render(
      <ServerFormScreen
        store={createStore().store}
        credentialStore={createCredentialStore()}
        createTestClient={factory}
      />
    );

    await fillBaseFields();
    await fireEvent.changeText(screen.getByPlaceholderText('password'), 'secret');
    armNextClient({ code: 'auth', message: 'All configured authentication methods failed' });
    await fireEvent.press(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed: All configured authentication methods failed')).toBeTruthy();
    });
    await selectDeviceKey();
    await waitForDeviceKeyReady();

    expect(screen.queryByText(/Connection failed/)).toBeNull();
  });
});
