import type { AsyncStorageLike } from '@/services/connection/server-profile-store';
import { AsyncStorageServerLastSessionStore } from '@/services/connection/server-last-session-store';

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

describe('AsyncStorageServerLastSessionStore', () => {
  it('returns null when no session is remembered for the profile', async () => {
    const store = new AsyncStorageServerLastSessionStore({ storage: createMemoryStorage() });

    await expect(store.find({ id: 'server-1' })).resolves.toBeNull();
  });

  it('round-trips the remembered session per profile', async () => {
    const storage = createMemoryStorage();
    const store = new AsyncStorageServerLastSessionStore({ storage });

    await store.save({ id: 'server-1', sessionName: 'work-abc123' });
    await store.save({ id: 'server-2', sessionName: 'play-def456' });

    await expect(store.find({ id: 'server-1' })).resolves.toBe('work-abc123');
    await expect(store.find({ id: 'server-2' })).resolves.toBe('play-def456');
    expect(storage.dump()['server-last-tmux-sessions']).toBe(
      JSON.stringify({ 'server-1': 'work-abc123', 'server-2': 'play-def456' })
    );
  });

  it('overwrites the remembered session for the same profile', async () => {
    const store = new AsyncStorageServerLastSessionStore({ storage: createMemoryStorage() });

    await store.save({ id: 'server-1', sessionName: 'work-abc123' });
    await store.save({ id: 'server-1', sessionName: 'play-abc123' });

    await expect(store.find({ id: 'server-1' })).resolves.toBe('play-abc123');
  });

  it('skips the write when the remembered session is unchanged', async () => {
    const storage = createMemoryStorage({
      'server-last-tmux-sessions': JSON.stringify({ 'server-1': 'work-abc123' }),
    });
    const store = new AsyncStorageServerLastSessionStore({ storage });

    await store.save({ id: 'server-1', sessionName: 'work-abc123' });

    expect(storage.dump()['server-last-tmux-sessions']).toBe(JSON.stringify({ 'server-1': 'work-abc123' }));
  });

  it('clears only the target profile entry', async () => {
    const storage = createMemoryStorage({
      'server-last-tmux-sessions': JSON.stringify({ 'server-1': 'work-abc123', 'server-2': 'play-def456' }),
    });
    const store = new AsyncStorageServerLastSessionStore({ storage });

    await store.clear({ id: 'server-1' });

    await expect(store.find({ id: 'server-1' })).resolves.toBeNull();
    await expect(store.find({ id: 'server-2' })).resolves.toBe('play-def456');
  });

  it('keeps the storage untouched when clearing an unknown profile', async () => {
    const initial = JSON.stringify({ 'server-2': 'play-def456' });
    const storage = createMemoryStorage({ 'server-last-tmux-sessions': initial });
    const store = new AsyncStorageServerLastSessionStore({ storage });

    await store.clear({ id: 'server-1' });

    expect(storage.dump()['server-last-tmux-sessions']).toBe(initial);
  });

  it('ignores corrupt storage content', async () => {
    const storage = createMemoryStorage({ 'server-last-tmux-sessions': 'not-json' });
    const store = new AsyncStorageServerLastSessionStore({ storage });

    await expect(store.find({ id: 'server-1' })).resolves.toBeNull();
  });

  it('ignores non-string session entries', async () => {
    const storage = createMemoryStorage({
      'server-last-tmux-sessions': JSON.stringify({ 'server-1': 7, 'server-2': 'play-def456' }),
    });
    const store = new AsyncStorageServerLastSessionStore({ storage });

    await expect(store.find({ id: 'server-1' })).resolves.toBeNull();
    await expect(store.find({ id: 'server-2' })).resolves.toBe('play-def456');
  });
});
