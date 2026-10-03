import type { AsyncStorageLike } from '@/services/connection/server-profile-store';
import { AsyncStorageActiveServerStore } from '@/services/connection/active-server-store';

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

describe('AsyncStorageActiveServerStore', () => {
  it('returns null when no active server is remembered', async () => {
    const store = new AsyncStorageActiveServerStore({ storage: createMemoryStorage() });

    await expect(store.find()).resolves.toBeNull();
  });

  it('round-trips the remembered active server', async () => {
    const storage = createMemoryStorage();
    const store = new AsyncStorageActiveServerStore({ storage });

    await store.save({ id: 'server-1' });

    await expect(store.find()).resolves.toBe('server-1');
    expect(storage.dump()['active-server-id']).toBe('server-1');
  });

  it('overwrites the remembered active server', async () => {
    const store = new AsyncStorageActiveServerStore({ storage: createMemoryStorage() });

    await store.save({ id: 'server-1' });
    await store.save({ id: 'server-2' });

    await expect(store.find()).resolves.toBe('server-2');
  });

  it('clears the remembered active server', async () => {
    const storage = createMemoryStorage({ 'active-server-id': 'server-1' });
    const store = new AsyncStorageActiveServerStore({ storage });

    await store.clear();

    await expect(store.find()).resolves.toBeNull();
    expect(storage.dump()['active-server-id']).toBeUndefined();
  });
});
