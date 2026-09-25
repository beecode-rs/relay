import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AsyncStorageLike } from '@/services/connection/server-profile-store';

export type ServerLastSessionStore = {
  find(params: { id: string }): Promise<string | null>;
  save(params: { id: string; sessionName: string }): Promise<void>;
  clear(params: { id: string }): Promise<void>;
};

const LAST_SESSION_STORAGE_KEY = 'server-last-tmux-sessions';

export class AsyncStorageServerLastSessionStore implements ServerLastSessionStore {
  private readonly storage: AsyncStorageLike;

  constructor(params: { storage?: AsyncStorageLike } = {}) {
    this.storage = params.storage ?? AsyncStorage;
  }

  async find(params: { id: string }): Promise<string | null> {
    const entries = await this._readEntries();

    return entries[params.id] ?? null;
  }

  async save(params: { id: string; sessionName: string }): Promise<void> {
    const entries = await this._readEntries();
    if (entries[params.id] === params.sessionName) {
      return;
    }
    await this.storage.setItem(
      LAST_SESSION_STORAGE_KEY,
      JSON.stringify({ ...entries, [params.id]: params.sessionName })
    );
  }

  async clear(params: { id: string }): Promise<void> {
    const entries = await this._readEntries();
    if (!(params.id in entries)) {
      return;
    }
    const remaining = Object.fromEntries(
      Object.entries(entries).filter(([id]) => {
        return id !== params.id;
      })
    );
    await this.storage.setItem(LAST_SESSION_STORAGE_KEY, JSON.stringify(remaining));
  }

  protected async _readEntries(): Promise<Record<string, string>> {
    const serialized = await this.storage.getItem(LAST_SESSION_STORAGE_KEY);
    if (serialized === null) {
      return {};
    }
    try {
      return this._toSessionEntries(JSON.parse(serialized) as unknown);
    } catch {
      return {};
    }
  }

  protected _toSessionEntries(value: unknown): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(([, sessionName]) => {
        return typeof sessionName === 'string';
      })
    );
  }
}

export const serverLastSessionStore: ServerLastSessionStore = new AsyncStorageServerLastSessionStore();
