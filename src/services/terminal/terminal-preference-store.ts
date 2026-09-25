import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AsyncStorageLike } from '@/services/connection/server-profile-store';
import type { TerminalPreferenceStorage } from '@/services/terminal/terminal-preference';

const TERMINAL_PREFERENCE_KEY = 'terminal-preference';

export class AsyncStorageTerminalPreferenceStorage implements TerminalPreferenceStorage {
  private readonly storage: AsyncStorageLike;

  constructor(params: { storage?: AsyncStorageLike } = {}) {
    this.storage = params.storage ?? AsyncStorage;
  }

  async readPreference(): Promise<string | null> {
    return this.storage.getItem(TERMINAL_PREFERENCE_KEY);
  }

  async writePreference(params: { value: string }): Promise<void> {
    await this.storage.setItem(TERMINAL_PREFERENCE_KEY, params.value);
  }
}

export const terminalPreferenceStorage: TerminalPreferenceStorage = new AsyncStorageTerminalPreferenceStorage();
