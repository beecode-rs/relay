import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { randomBytes } from 'crypto';
import { getKeys } from 'micro-key-producer/ssh.js';
import { Platform } from 'react-native';

import { constant } from '@/constants/constant';


export type DeviceKeyInfo = {
  comment: string;
  createdAt: string;
  fingerprint: string;
  privateKey: string;
  publicKey: string;
};

export type DeviceKeyPublicInfo = Omit<DeviceKeyInfo, 'privateKey'>;

export type SecureStoreLike = {
  deleteItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
};

export type DeviceKeyStore = {
  find(): Promise<DeviceKeyInfo | null>;
  remove(): Promise<void>;
  save(params: { keyInfo: DeviceKeyInfo }): Promise<void>;
};

const isDeviceKeyInfo = (value: unknown): value is DeviceKeyInfo => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  return ['comment', 'createdAt', 'fingerprint', 'privateKey', 'publicKey'].every((field) => {
    return typeof candidate[field] === 'string' && candidate[field] !== '';
  });
};

const toRuntimeAccessGroup = (): string | undefined => {
  const teamId = Constants.expoConfig?.extra?.beecodeTeamId;
  if (typeof teamId !== 'string' || teamId === '') {
    return undefined;
  }

  return `${teamId}.${constant.deviceKey.accessGroup}`;
};

const toSanitizedName = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
};

const toAppName = (): string => {
  return toSanitizedName(Constants.expoConfig?.name ?? Constants.expoConfig?.slug ?? '') || 'relay';
};

const toDeviceName = (): string => {
  return toSanitizedName(Device.deviceName ?? Device.modelName ?? '') || 'device';
};

const toPublicKeyWithComment = (publicKey: string, comment: string): string => {
  const [keyType, keyData] = publicKey.trim().split(/\s+/);

  return `${keyType} ${keyData} ${comment}`;
};

export const generateDeviceKey = (): DeviceKeyInfo => {
  const comment = `${toAppName()}-beecode@${toDeviceName()}-${Platform.OS}`;
  const keys = getKeys(randomBytes(32), comment);

  return {
    comment,
    createdAt: new Date().toISOString(),
    fingerprint: keys.fingerprint,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
  };
};

export class SecureStoreDeviceKeyStore implements DeviceKeyStore {
  private readonly secureStore: SecureStoreLike;

  constructor(params: { secureStore?: SecureStoreLike } = {}) {
    this.secureStore = params.secureStore ?? SecureStore;
  }

  async find(): Promise<DeviceKeyInfo | null> {
    const keyInfo = this._parseSerialized(
      await this.secureStore.getItemAsync(constant.deviceKey.itemKey, this._secureStoreOptions())
    );
    if (keyInfo !== null) {
      return keyInfo;
    }

    return this._migrateUngroupedItem();
  }

  async remove(): Promise<void> {
    await this.secureStore.deleteItemAsync(constant.deviceKey.itemKey, this._secureStoreOptions());
  }

  async save(params: { keyInfo: DeviceKeyInfo }): Promise<void> {
    await this.secureStore.setItemAsync(
      constant.deviceKey.itemKey,
      JSON.stringify(params.keyInfo),
      this._secureStoreOptions()
    );
  }

  protected _parseSerialized(serialized: string | null): DeviceKeyInfo | null {
    if (serialized === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(serialized) as unknown;

      return isDeviceKeyInfo(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  protected async _migrateUngroupedItem(): Promise<DeviceKeyInfo | null> {
    if (toRuntimeAccessGroup() === undefined) {
      return null;
    }
    const keyInfo = this._parseSerialized(
      await this.secureStore.getItemAsync(constant.deviceKey.itemKey, this._ungroupedSecureStoreOptions())
    );
    if (keyInfo === null) {
      return null;
    }
    await this.save({ keyInfo });

    return keyInfo;
  }

  protected _ungroupedSecureStoreOptions(): SecureStore.SecureStoreOptions {
    return {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      keychainService: constant.deviceKey.keychainService,
    };
  }

  protected _secureStoreOptions(): SecureStore.SecureStoreOptions {
    const accessGroup = toRuntimeAccessGroup();
    if (accessGroup === undefined) {
      return this._ungroupedSecureStoreOptions();
    }

    return { ...this._ungroupedSecureStoreOptions(), accessGroup };
  }
}

export class DeviceKeyService {
  protected _inFlight: Promise<DeviceKeyInfo> | null = null;
  protected readonly store: DeviceKeyStore;

  constructor(params: { store?: DeviceKeyStore } = {}) {
    this.store = params.store ?? new SecureStoreDeviceKeyStore();
  }

  async find(): Promise<DeviceKeyInfo | null> {
    return this.store.find();
  }

  async getOrCreate(): Promise<DeviceKeyInfo> {
    if (this._inFlight === null) {
      this._inFlight = this._resolveDeviceKey().finally(() => {
        this._inFlight = null;
      });
    }

    return this._inFlight;
  }

  async regenerate(): Promise<DeviceKeyInfo> {
    return this._createDeviceKey();
  }

  async rename(params: { comment: string }): Promise<DeviceKeyInfo | null> {
    const existing = await this.store.find();
    if (existing === null) {
      return null;
    }
    const comment = params.comment.trim();
    if (comment === '') {
      return existing;
    }
    const keyInfo = {
      ...existing,
      comment,
      publicKey: toPublicKeyWithComment(existing.publicKey, comment),
    };
    await this.store.save({ keyInfo });

    return keyInfo;
  }

  async remove(): Promise<void> {
    await this.store.remove();
  }

  protected async _resolveDeviceKey(): Promise<DeviceKeyInfo> {
    const existing = await this.store.find();
    if (existing !== null) {
      return existing;
    }

    return this._createDeviceKey();
  }

  protected async _createDeviceKey(): Promise<DeviceKeyInfo> {
    const keyInfo = generateDeviceKey();
    await this.store.save({ keyInfo });

    return keyInfo;
  }
}

export const deviceKeyService = new DeviceKeyService();
