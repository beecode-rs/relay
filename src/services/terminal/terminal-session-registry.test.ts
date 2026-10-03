import { createMockSshBridge } from '@/services/terminal/mock-ssh-bridge';
import type { MockSshBridge } from '@/services/terminal/mock-ssh-bridge';
import { TerminalSessionRegistry } from '@/services/terminal/terminal-session-registry';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

jest.mock('react-native', () => {
  return { Platform: { OS: 'android' } };
});

const toOptions = (host: string): SshConnectOptions => {
  return {
    acceptedHostKeys: [],
    auth: { kind: 'password', password: 'secret' },
    cols: 80,
    host,
    port: 22,
    rows: 24,
    username: 'user',
  };
};

type RegistryHarness = {
  bridges: MockSshBridge[];
  registry: TerminalSessionRegistry;
};

const createRegistryHarness = (): RegistryHarness => {
  const bridges: MockSshBridge[] = [];
  const registry = new TerminalSessionRegistry({
    portFactory: () => {
      const bridge = createMockSshBridge();
      bridges.push(bridge);
      return bridge;
    },
  });
  return { bridges, registry };
};

describe('TerminalSessionRegistry.ensureStarted', () => {
  it('starts a new session on its own port', async () => {
    const { bridges, registry } = createRegistryHarness();
    const entry = await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    expect(entry.profileId).toBe('a');
    expect(entry.session.status).toBe('connected');
    expect(bridges).toHaveLength(1);
    expect(bridges[0].connectCalls).toHaveLength(1);
    expect(registry.list().map((entry) => { return entry.profileId; })).toEqual(['a']);
  });

  it('reuses the running session without reconnecting', async () => {
    const { bridges, registry } = createRegistryHarness();
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    const again = await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    expect(bridges).toHaveLength(1);
    expect(bridges[0].connectCalls).toHaveLength(1);
    expect(again.session).toBe(registry.find('a')?.session);
  });

  it('restarts the session when the profile is no longer active for it', async () => {
    const { bridges, registry } = createRegistryHarness();
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    bridges[0].emitError({ code: 'network', message: 'dropped' });
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    expect(bridges[0].connectCalls).toHaveLength(2);
  });

  it('keeps servers on separate ports', async () => {
    const { bridges, registry } = createRegistryHarness();
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    await registry.ensureStarted({ profileId: 'b', connectOptions: toOptions('b.example.com') });
    expect(bridges).toHaveLength(2);
    expect(bridges[0].written).toHaveLength(0);
    expect(registry.list().map((entry) => { return entry.profileId; })).toEqual(['a', 'b']);
  });

  it('notifies subscribers when a session is added', async () => {
    const { registry } = createRegistryHarness();
    const listener = jest.fn();
    registry.subscribe(listener);
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('TerminalSessionRegistry.disconnect', () => {
  it('ends the session, drops the entry, and notifies', async () => {
    const { bridges, registry } = createRegistryHarness();
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    const listener = jest.fn();
    registry.subscribe(listener);
    registry.disconnect('a');
    expect(bridges[0].disconnectCount).toBe(1);
    expect(registry.find('a')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown profile ids', () => {
    const { registry } = createRegistryHarness();
    expect(() => {
      registry.disconnect('missing');
    }).not.toThrow();
  });

  it('keeps other servers connected', async () => {
    const { bridges, registry } = createRegistryHarness();
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    await registry.ensureStarted({ profileId: 'b', connectOptions: toOptions('b.example.com') });
    registry.disconnect('a');
    expect(bridges[0].disconnectCount).toBe(1);
    expect(bridges[1].disconnectCount).toBe(0);
    expect(registry.list().map((entry) => { return entry.profileId; })).toEqual(['b']);
  });
});

describe('TerminalSessionRegistry close handling', () => {
  it('removes the entry when the server closes the connection', async () => {
    const { bridges, registry } = createRegistryHarness();
    const listener = jest.fn();
    registry.subscribe(listener);
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    listener.mockClear();
    bridges[0].emitClosed('bye');
    expect(registry.find('a')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the entry when the session errors so it can be reconnected', async () => {
    const { bridges, registry } = createRegistryHarness();
    await registry.ensureStarted({ profileId: 'a', connectOptions: toOptions('a.example.com') });
    bridges[0].emitError({ code: 'auth', message: 'boom' });
    expect(registry.find('a')).not.toBeNull();
  });
});
