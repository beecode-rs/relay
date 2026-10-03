import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AsyncStorageLike } from '@/services/connection/server-profile-store';

export type ActiveServerStore = {
  find(): Promise<string | null>;
  save(params: { id: string }): Promise<void>;
  clear(): Promise<void>;
};

const ACTIVE_SERVER_STORAGE_KEY = 'active-server-id';

export class AsyncStorageActiveServerStore implements ActiveServerStore {
  private readonly storage: AsyncStorageLike;

  constructor(params: { storage?: AsyncStorageLike } = {}) {
    this.storage = params.storage ?? AsyncStorage;
  }

  async find(): Promise<string | null> {
    const value = await this.storage.getItem(ACTIVE_SERVER_STORAGE_KEY);

    return typeof value === 'string' && value !== '' ? value : null;
  }

  async save(params: { id: string }): Promise<void> {
    await this.storage.setItem(ACTIVE_SERVER_STORAGE_KEY, params.id);
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(ACTIVE_SERVER_STORAGE_KEY);
  }
}

export const activeServerStore: ActiveServerStore = new AsyncStorageActiveServerStore();
