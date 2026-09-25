import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AsyncStorageLike } from '@/services/connection/server-profile-store';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

const THEME_PREFERENCE_KEY = 'theme-preference';

export class AsyncStorageThemePreferenceStorage implements ThemePreferenceStorage {
  private readonly storage: AsyncStorageLike;

  constructor(params: { storage?: AsyncStorageLike } = {}) {
    this.storage = params.storage ?? AsyncStorage;
  }

  async readPreference(): Promise<string | null> {
    return this.storage.getItem(THEME_PREFERENCE_KEY);
  }

  async writePreference(params: { value: string }): Promise<void> {
    const { value } = params;
    await this.storage.setItem(THEME_PREFERENCE_KEY, value);
  }
}

export const themePreferenceStorage: ThemePreferenceStorage = new AsyncStorageThemePreferenceStorage();
