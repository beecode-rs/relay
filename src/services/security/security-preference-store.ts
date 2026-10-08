import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AsyncStorageLike } from '@/services/connection/server-profile-store';
import type { SecurityPreferenceStorage } from '@/services/security/security-preference';

const SECURITY_PREFERENCE_KEY = 'security-preference';

export class AsyncStorageSecurityPreferenceStorage implements SecurityPreferenceStorage {
  private readonly storage: AsyncStorageLike;

  constructor(params: { storage?: AsyncStorageLike } = {}) {
    this.storage = params.storage ?? AsyncStorage;
  }

  async readPreference(): Promise<string | null> {
    return this.storage.getItem(SECURITY_PREFERENCE_KEY);
  }

  async writePreference(params: { value: string }): Promise<void> {
    await this.storage.setItem(SECURITY_PREFERENCE_KEY, params.value);
  }
}

export const securityPreferenceStorage: SecurityPreferenceStorage = new AsyncStorageSecurityPreferenceStorage();
