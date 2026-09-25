import type { ServerCredentialStore } from '@/services/connection/credential-store';
import type { ServerLastSessionStore } from '@/services/connection/server-last-session-store';
import type { AsyncStorageLike } from '@/services/connection/server-profile-store';
import { AsyncStorageServerProfileStore } from '@/services/connection/server-profile-store';
import type { ServerProfile, ServerProfileSecrets } from '@/services/connection/server-profile';

type MemoryStorage = AsyncStorageLike & {
  dump(): Record<string, string>;
};

const createMemoryStorage = (initial: Record<string, string> = {}): MemoryStorage => {
  const data = new Map(Object.entries(initial));

  return {
    dump: () => {
      return Object.fromEntries(data.entries());
    },
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async removeItem(key) {
      data.delete(key);
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
};

const createCredentialStore = () => {
  const secretsById = new Map<string, ServerProfileSecrets>();
  const store: ServerCredentialStore = {
    async find({ id }) {
      return secretsById.get(id) ?? null;
    },
    async remove({ id }) {
      secretsById.delete(id);
    },
    async save({ id, secrets }) {
      secretsById.set(id, secrets);
    },
  };

  return { secretsById, store };
};

const createLastSessionStore = () => {
  const sessionNamesById = new Map<string, string>();
  const store: ServerLastSessionStore = {
    async clear({ id }) {
      sessionNamesById.delete(id);
    },
    async find({ id }) {
      return sessionNamesById.get(id) ?? null;
    },
    async save({ id, sessionName }) {
      sessionNamesById.set(id, sessionName);
    },
  };

  return { sessionNamesById, store };
};

const toProfile = (overrides: Partial<ServerProfile> = {}): ServerProfile => {
  return {
    acceptedHostKeys: [],
    authMethod: 'password',
    host: 'example.com',
    id: 'server-1',
    label: 'Example',
    port: 22,
    tmuxPrefix: 'abc123',
    username: 'user',
    ...overrides,
  };
};

describe('AsyncStorageServerProfileStore', () => {
  it('saves and finds profiles by id', async () => {
    const store = new AsyncStorageServerProfileStore({
      storage: createMemoryStorage(),
      credentialStore: createCredentialStore().store,
    });
    const profile = toProfile();

    await store.save({ profile, secrets: { password: 'secret' } });

    expect(await store.findById({ id: 'server-1' })).toEqual(profile);
    expect(await store.findById({ id: 'missing' })).toBeNull();
  });

  it('lists profiles sorted by label', async () => {
    const store = new AsyncStorageServerProfileStore({
      storage: createMemoryStorage(),
      credentialStore: createCredentialStore().store,
    });

    await store.save({ profile: toProfile({ id: 'a', label: 'Zulu' }) });
    await store.save({ profile: toProfile({ id: 'b', label: 'Alpha' }) });

    expect((await store.list()).map((profile) => {
      return profile.label;
    })).toEqual(['Alpha', 'Zulu']);
  });

  it('updates an existing profile instead of duplicating it', async () => {
    const store = new AsyncStorageServerProfileStore({
      storage: createMemoryStorage(),
      credentialStore: createCredentialStore().store,
    });

    await store.save({ profile: toProfile() });
    await store.save({ profile: toProfile({ host: 'renamed.com' }) });

    const profiles = await store.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].host).toBe('renamed.com');
  });

  it('stores credentials alongside the profile', async () => {
    const credentialStore = createCredentialStore();
    const store = new AsyncStorageServerProfileStore({
      storage: createMemoryStorage(),
      credentialStore: credentialStore.store,
    });

    await store.save({ profile: toProfile({ authMethod: 'privateKey' }), secrets: { privateKey: 'KEY' } });

    expect(credentialStore.secretsById.get('server-1')).toEqual({ privateKey: 'KEY' });
  });

  it('backfills a deterministic tmux prefix for stored profiles without one', async () => {
    const legacyShape = {
      acceptedHostKeys: [],
      authMethod: 'password',
      host: 'example.com',
      id: 'server-9',
      label: 'Example',
      port: 22,
      username: 'user',
    };
    const storage = createMemoryStorage({ 'server-profiles': JSON.stringify([legacyShape]) });
    const store = new AsyncStorageServerProfileStore({ storage, credentialStore: createCredentialStore().store });

    const first = await store.findById({ id: 'server-9' });
    const second = await store.findById({ id: 'server-9' });

    expect(first?.tmuxPrefix).toBe('server');
    expect(second?.tmuxPrefix).toBe('server');
  });

  it('removes the profile, its credentials and its remembered session', async () => {
    const credentialStore = createCredentialStore();
    const lastSessionStore = createLastSessionStore();
    const storage = createMemoryStorage();
    const store = new AsyncStorageServerProfileStore({
      credentialStore: credentialStore.store,
      lastSessionStore: lastSessionStore.store,
      storage,
    });

    await store.save({ profile: toProfile(), secrets: { password: 'secret' } });
    await lastSessionStore.store.save({ id: 'server-1', sessionName: 'work-abc123' });
    await store.remove({ id: 'server-1' });

    expect(await store.list()).toEqual([]);
    expect(credentialStore.secretsById.has('server-1')).toBe(false);
    expect(lastSessionStore.sessionNamesById.has('server-1')).toBe(false);
  });
});

describe('AsyncStorageServerProfileStore.migrateLegacyProfile', () => {
  const legacyProfile = {
    acceptedHostKeys: ['example.com ssh-ed25519 KEY'],
    auth: { kind: 'password', password: 'legacy-secret' },
    host: 'example.com',
    port: 22,
    username: 'user',
  };

  it('imports the legacy single profile with its secrets and removes the legacy key', async () => {
    const credentialStore = createCredentialStore();
    const storage = createMemoryStorage({ 'connection-profile': JSON.stringify(legacyProfile) });
    const store = new AsyncStorageServerProfileStore({ storage, credentialStore: credentialStore.store });

    await store.migrateLegacyProfile();

    const profiles = await store.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      acceptedHostKeys: ['example.com ssh-ed25519 KEY'],
      authMethod: 'password',
      host: 'example.com',
      label: 'example.com',
      port: 22,
      username: 'user',
    });
    expect(credentialStore.secretsById.get(profiles[0].id)).toEqual({ password: 'legacy-secret' });
    expect(profiles[0].tmuxPrefix).toMatch(/^[a-f0-9]{6}$/);
    expect(storage.dump()['connection-profile']).toBeUndefined();
  });

  it('imports a legacy private key profile with its passphrase', async () => {
    const credentialStore = createCredentialStore();
    const keyProfile = {
      ...legacyProfile,
      auth: { kind: 'privateKey', passphrase: 'phrase', privateKey: 'KEY' },
    };
    const storage = createMemoryStorage({ 'connection-profile': JSON.stringify(keyProfile) });
    const store = new AsyncStorageServerProfileStore({ storage, credentialStore: credentialStore.store });

    await store.migrateLegacyProfile();

    const profiles = await store.list();
    expect(profiles[0].authMethod).toBe('privateKey');
    expect(credentialStore.secretsById.get(profiles[0].id)).toEqual({ passphrase: 'phrase', privateKey: 'KEY' });
  });

  it('keeps existing profiles and only drops the legacy key', async () => {
    const credentialStore = createCredentialStore();
    const storage = createMemoryStorage({ 'connection-profile': JSON.stringify(legacyProfile) });
    const store = new AsyncStorageServerProfileStore({ storage, credentialStore: credentialStore.store });

    await store.save({ profile: toProfile() });
    await store.migrateLegacyProfile();

    expect(await store.list()).toHaveLength(1);
    expect(storage.dump()['connection-profile']).toBeUndefined();
  });

  it('drops an unreadable legacy profile', async () => {
    const storage = createMemoryStorage({ 'connection-profile': 'not-json' });
    const store = new AsyncStorageServerProfileStore({ storage, credentialStore: createCredentialStore().store });

    await store.migrateLegacyProfile();

    expect(await store.list()).toEqual([]);
    expect(storage.dump()['connection-profile']).toBeUndefined();
  });

  it('does nothing without a legacy key', async () => {
    const storage = createMemoryStorage();
    const store = new AsyncStorageServerProfileStore({ storage, credentialStore: createCredentialStore().store });

    await store.migrateLegacyProfile();

    expect(await store.list()).toEqual([]);
  });
});
