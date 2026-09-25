import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ServerCredentialStore } from '@/services/connection/credential-store';
import { serverCredentialStore } from '@/services/connection/credential-store';
import type { ServerLastSessionStore } from '@/services/connection/server-last-session-store';
import { serverLastSessionStore } from '@/services/connection/server-last-session-store';
import type { ServerProfile, ServerProfileSecrets } from '@/services/connection/server-profile';
import { serverProfileIdUtil, serverProfileTmuxUtil } from '@/services/connection/server-profile';

export type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type ServerProfileStore = {
  list(): Promise<ServerProfile[]>;
  findById(params: { id: string }): Promise<ServerProfile | null>;
  save(params: { profile: ServerProfile; secrets?: ServerProfileSecrets }): Promise<void>;
  remove(params: { id: string }): Promise<void>;
  migrateLegacyProfile(): Promise<void>;
};

type LegacyConnectionProfile = {
  host: string;
  port: number;
  username: string;
  auth: { kind: 'password'; password: string } | { kind: 'privateKey'; privateKey: string; passphrase?: string };
  acceptedHostKeys?: string[];
};

const PROFILE_STORAGE_KEY = 'server-profiles';
const LEGACY_STORAGE_KEY = 'connection-profile';

export class AsyncStorageServerProfileStore implements ServerProfileStore {
  private readonly credentialStore: ServerCredentialStore;
  private readonly lastSessionStore: ServerLastSessionStore;
  private readonly storage: AsyncStorageLike;

  constructor(
    params: {
      credentialStore?: ServerCredentialStore;
      lastSessionStore?: ServerLastSessionStore;
      storage?: AsyncStorageLike;
    } = {}
  ) {
    this.storage = params.storage ?? AsyncStorage;
    this.credentialStore = params.credentialStore ?? serverCredentialStore;
    this.lastSessionStore = params.lastSessionStore ?? serverLastSessionStore;
  }

  async list(): Promise<ServerProfile[]> {
    const profiles = await this._readProfiles();

    return [...profiles].sort((left, right) => {
      return left.label.localeCompare(right.label);
    });
  }

  async findById(params: { id: string }): Promise<ServerProfile | null> {
    const match = (await this._readProfiles()).find((profile) => {
      return profile.id === params.id;
    });

    return match ?? null;
  }

  async save(params: { profile: ServerProfile; secrets?: ServerProfileSecrets }): Promise<void> {
    const withoutMatch = (await this._readProfiles()).filter((profile) => {
      return profile.id !== params.profile.id;
    });
    await this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify([...withoutMatch, params.profile]));
    if (params.secrets !== undefined) {
      await this.credentialStore.save({ id: params.profile.id, secrets: params.secrets });
    }
  }

  async remove(params: { id: string }): Promise<void> {
    const withoutMatch = (await this._readProfiles()).filter((profile) => {
      return profile.id !== params.id;
    });
    await this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(withoutMatch));
    await this.credentialStore.remove({ id: params.id });
    await this.lastSessionStore.clear({ id: params.id });
  }

  async migrateLegacyProfile(): Promise<void> {
    const raw = await this.storage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) {
      return;
    }
    const existing = await this._readProfiles();
    if (existing.length > 0) {
      await this.storage.removeItem(LEGACY_STORAGE_KEY);

      return;
    }
    const legacy = this._parseLegacyProfile(raw);
    if (legacy === null) {
      await this.storage.removeItem(LEGACY_STORAGE_KEY);

      return;
    }
    const profile: ServerProfile = {
      acceptedHostKeys: legacy.acceptedHostKeys ?? [],
      authMethod: legacy.auth.kind === 'password' ? 'password' : 'privateKey',
      host: legacy.host,
      id: this._generateId(),
      label: legacy.host,
      port: legacy.port,
      tmuxPrefix: serverProfileTmuxUtil.generatePrefix(),
      username: legacy.username,
    };
    const secrets: ServerProfileSecrets =
      legacy.auth.kind === 'password'
        ? { password: legacy.auth.password }
        : { passphrase: legacy.auth.passphrase, privateKey: legacy.auth.privateKey };
    await this.save({ profile, secrets });
    await this.storage.removeItem(LEGACY_STORAGE_KEY);
  }

  protected _generateId(): string {
    return serverProfileIdUtil.generateId();
  }

  protected async _readProfiles(): Promise<ServerProfile[]> {
    const serialized = await this.storage.getItem(PROFILE_STORAGE_KEY);
    if (serialized === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(serialized) as ServerProfile[];

      return Array.isArray(parsed) ? parsed.map((profile) => { return this._withTmuxPrefix(profile); }) : [];
    } catch {
      return [];
    }
  }

  protected _withTmuxPrefix(profile: ServerProfile): ServerProfile {
    if (typeof profile.tmuxPrefix === 'string' && profile.tmuxPrefix !== '') {
      return profile;
    }

    return { ...profile, tmuxPrefix: profile.id.slice(0, 6) };
  }

  protected _parseLegacyProfile(raw: string): LegacyConnectionProfile | null {
    try {
      const parsed = JSON.parse(raw) as LegacyConnectionProfile;
      if (typeof parsed?.host !== 'string' || typeof parsed?.username !== 'string') {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }
}

export const serverProfileStore: ServerProfileStore = new AsyncStorageServerProfileStore();
