import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { constant } from '@/constants/constant';
import type { DeviceKeyInfo, DeviceKeyStore, SecureStoreLike } from '@/services/connection/device-key';
import {
  DeviceKeyService,
  SecureStoreDeviceKeyStore,
  generateDeviceKey,
} from '@/services/connection/device-key';

jest.mock('expo-constants', () => {
  return { __esModule: true, default: { expoConfig: undefined } };
});

jest.mock('expo-device', () => {
  return { __esModule: true, deviceName: null, modelName: null };
});

const deviceMock = Device as unknown as { deviceName: string | null; modelName: string | null };

type RecordedSecureStoreCall = {
  key: string;
  options?: SecureStore.SecureStoreOptions;
  value?: string;
};

const createSecureStoreFake = () => {
  const items = new Map<string, string>();
  const deleteCalls: RecordedSecureStoreCall[] = [];
  const getCalls: RecordedSecureStoreCall[] = [];
  const setCalls: RecordedSecureStoreCall[] = [];
  const secureStore: SecureStoreLike = {
    async deleteItemAsync(key, options) {
      deleteCalls.push({ key, options });
      items.delete(key);
    },
    async getItemAsync(key, options) {
      getCalls.push({ key, options });
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value, options) {
      setCalls.push({ key, options, value });
      items.set(key, value);
    },
  };

  return { deleteCalls, getCalls, items, secureStore, setCalls };
};

const toKeyInfo = (overrides: Partial<DeviceKeyInfo> = {}): DeviceKeyInfo => {
  return {
    comment: 'beecode@ios-1a2b3c',
    createdAt: '2026-01-01T00:00:00.000Z',
    fingerprint: 'SHA256:unit-test',
    privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----',
    publicKey: 'ssh-ed25519 AAAAUNITTESTKEY beecode@ios-1a2b3c',
    ...overrides,
  };
};

describe('SecureStoreDeviceKeyStore', () => {
  beforeEach(() => {
    Constants.expoConfig = null;
  });

  it('saves and finds a stored key', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });
    const keyInfo = toKeyInfo();

    await store.save({ keyInfo });

    expect(await store.find()).toEqual(keyInfo);
  });

  it('returns null when no key is stored', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    expect(await store.find()).toBeNull();
  });

  it('returns null for corrupt stored JSON', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });
    fake.items.set(constant.deviceKey.itemKey, 'not-json');

    expect(await store.find()).toBeNull();
  });

  it('returns null when a field is an empty string', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });
    fake.items.set(constant.deviceKey.itemKey, JSON.stringify(toKeyInfo({ fingerprint: '' })));

    expect(await store.find()).toBeNull();
  });

  it('returns null when a field is missing', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });
    fake.items.set(constant.deviceKey.itemKey, JSON.stringify({ ...toKeyInfo(), comment: undefined }));

    expect(await store.find()).toBeNull();
  });

  it('returns null when a field is not a string', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });
    const corrupted = { ...toKeyInfo(), createdAt: 42 } as unknown as Record<string, unknown>;
    fake.items.set(constant.deviceKey.itemKey, JSON.stringify(corrupted));

    expect(await store.find()).toBeNull();
  });

  it('removes the stored key', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });
    await store.save({ keyInfo: toKeyInfo() });

    await store.remove();

    expect(await store.find()).toBeNull();
    expect(fake.deleteCalls[0].key).toBe(constant.deviceKey.itemKey);
  });

  it('scopes every operation to the device keychain with this-device-only accessibility', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    await store.save({ keyInfo: toKeyInfo() });
    await store.find();
    await store.remove();

    expect(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY).toBeDefined();
    const calls = [...fake.setCalls, ...fake.getCalls, ...fake.deleteCalls];
    expect(calls).toHaveLength(3);
    calls.forEach((call) => {
      expect(call.key).toBe(constant.deviceKey.itemKey);
      expect(call.options).toMatchObject({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        keychainService: 'com.beecode.devicekey',
      });
    });
  });

  it('targets the team access group when a team id is configured', async () => {
    Constants.expoConfig = { extra: { beecodeTeamId: 'TEAM1234' }, name: 'relay', slug: 'relay' };
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    await store.save({ keyInfo: toKeyInfo() });
    await store.find();

    expect(fake.setCalls[0].options?.accessGroup).toBe('TEAM1234.com.beecode.devicekeys');
    expect(fake.getCalls[0].options?.accessGroup).toBe('TEAM1234.com.beecode.devicekeys');
  });

  it('omits the access group when the team id is blank', async () => {
    Constants.expoConfig = { extra: { beecodeTeamId: '' }, name: 'relay', slug: 'relay' };
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    await store.save({ keyInfo: toKeyInfo() });

    expect(fake.setCalls[0].options?.accessGroup).toBeUndefined();
  });

  it('omits the access group when the expo config is unavailable', async () => {
    const fake = createSecureStoreFake();
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    await store.save({ keyInfo: toKeyInfo() });

    expect(fake.setCalls[0].options?.accessGroup).toBeUndefined();
  });
});

describe('SecureStoreDeviceKeyStore access group migration', () => {
  const GROUPED_ITEM_KEY = 'TEAM1234.com.beecode.devicekeys|beecode-device-key';
  const UNGROUPED_ITEM_KEY = 'ungrouped|beecode-device-key';

  const createScopedSecureStoreFake = () => {
    const items = new Map<string, string>();
    const toStorageKey = (key: string, options?: SecureStore.SecureStoreOptions): string => {
      return options?.accessGroup !== undefined ? `${options.accessGroup}|${key}` : `ungrouped|${key}`;
    };
    const secureStore: SecureStoreLike = {
      async deleteItemAsync(key, options) {
        items.delete(toStorageKey(key, options));
      },
      async getItemAsync(key, options) {
        return items.get(toStorageKey(key, options)) ?? null;
      },
      async setItemAsync(key, value, options) {
        items.set(toStorageKey(key, options), value);
      },
    };

    return { items, secureStore };
  };

  beforeEach(() => {
    Constants.expoConfig = null;
  });

  it('migrates an ungrouped item into the access group when a team id is configured', async () => {
    const keyInfo = toKeyInfo();
    const fake = createScopedSecureStoreFake();
    fake.items.set(UNGROUPED_ITEM_KEY, JSON.stringify(keyInfo));
    Constants.expoConfig = { extra: { beecodeTeamId: 'TEAM1234' }, name: 'relay', slug: 'relay' };
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    expect(await store.find()).toEqual(keyInfo);
    expect(fake.items.get(GROUPED_ITEM_KEY)).toBe(JSON.stringify(keyInfo));
    expect(fake.items.has(UNGROUPED_ITEM_KEY)).toBe(true);
  });

  it('returns null without writing when no access group is configured and only a grouped item exists', async () => {
    const fake = createScopedSecureStoreFake();
    fake.items.set(GROUPED_ITEM_KEY, JSON.stringify(toKeyInfo()));
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    expect(await store.find()).toBeNull();
    expect(fake.items.has(GROUPED_ITEM_KEY)).toBe(true);
  });

  it('returns null when no item exists in either scope', async () => {
    const fake = createScopedSecureStoreFake();
    Constants.expoConfig = { extra: { beecodeTeamId: 'TEAM1234' }, name: 'relay', slug: 'relay' };
    const store = new SecureStoreDeviceKeyStore({ secureStore: fake.secureStore });

    expect(await store.find()).toBeNull();
    expect(fake.items.size).toBe(0);
  });
});

describe('DeviceKeyService', () => {
  const createStoreFake = (existing: DeviceKeyInfo | null) => {
    const removed: boolean[] = [];
    const saved: DeviceKeyInfo[] = [];
    const store: DeviceKeyStore = {
      async find() {
        return existing;
      },
      async remove() {
        removed.push(true);
      },
      async save(params) {
        saved.push(params.keyInfo);
      },
    };

    return { removed, saved, store };
  };

  it('returns the stored key without generating a new one', async () => {
    const existing = toKeyInfo();
    const { saved, store } = createStoreFake(existing);
    const service = new DeviceKeyService({ store });

    expect(await service.getOrCreate()).toEqual(existing);
    expect(saved).toHaveLength(0);
  });

  it('finds the stored key without creating one', async () => {
    const existing = toKeyInfo();
    const { saved, store } = createStoreFake(existing);
    const service = new DeviceKeyService({ store });

    expect(await service.find()).toEqual(existing);
    expect(saved).toHaveLength(0);
  });

  it('returns null from find when no key exists', async () => {
    const { saved, store } = createStoreFake(null);
    const service = new DeviceKeyService({ store });

    expect(await service.find()).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('regenerates and overwrites an existing key', async () => {
    const existing = toKeyInfo();
    const { saved, store } = createStoreFake(existing);
    const service = new DeviceKeyService({ store });

    const keyInfo = await service.regenerate();

    expect(keyInfo.publicKey).not.toBe(existing.publicKey);
    expect(keyInfo.comment).not.toBe(existing.comment);
    expect(saved).toEqual([keyInfo]);
  });

  it('renames the stored key and rewrites the public key comment', async () => {
    const existing = toKeyInfo();
    const { saved, store } = createStoreFake(existing);
    const service = new DeviceKeyService({ store });

    const keyInfo = await service.rename({ comment: 'Relay-beecode@My iPhone-ios ' });

    expect(keyInfo?.comment).toBe('Relay-beecode@My iPhone-ios');
    expect(keyInfo?.publicKey).toBe('ssh-ed25519 AAAAUNITTESTKEY Relay-beecode@My iPhone-ios');
    expect(keyInfo?.privateKey).toBe(existing.privateKey);
    expect(keyInfo?.fingerprint).toBe(existing.fingerprint);
    expect(saved).toEqual([keyInfo]);
  });

  it('keeps the stored key when renaming to a blank comment', async () => {
    const existing = toKeyInfo();
    const { saved, store } = createStoreFake(existing);
    const service = new DeviceKeyService({ store });

    expect(await service.rename({ comment: '   ' })).toEqual(existing);
    expect(saved).toHaveLength(0);
  });

  it('returns null from rename when no key exists', async () => {
    const { saved, store } = createStoreFake(null);
    const service = new DeviceKeyService({ store });

    expect(await service.rename({ comment: 'Relay-beecode@My iPhone-ios' })).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('removes the stored key', async () => {
    const { removed, store } = createStoreFake(toKeyInfo());
    const service = new DeviceKeyService({ store });

    await service.remove();

    expect(removed).toHaveLength(1);
  });

  it('generates and stores a key when none exists', async () => {
    const { saved, store } = createStoreFake(null);
    const service = new DeviceKeyService({ store });

    const keyInfo = await service.getOrCreate();

    expect(keyInfo.publicKey.startsWith('ssh-ed25519 ')).toBe(true);
    expect(saved).toEqual([keyInfo]);
  });

  it('shares a single generation across concurrent calls', async () => {
    const deferred: { resolve: (keyInfo: DeviceKeyInfo | null) => void } = {
      resolve: () => {
        return;
      },
    };
    const findPromise = new Promise<DeviceKeyInfo | null>((resolve) => {
      deferred.resolve = resolve;
    });
    const saved: DeviceKeyInfo[] = [];
    const store: DeviceKeyStore = {
      find: () => {
        return findPromise;
      },
      async remove() {},
      async save(params) {
        saved.push(params.keyInfo);
      },
    };
    const service = new DeviceKeyService({ store });

    const first = service.getOrCreate();
    const second = service.getOrCreate();
    deferred.resolve(null);
    const [firstKey, secondKey] = await Promise.all([first, second]);

    expect(firstKey).toEqual(secondKey);
    expect(saved).toHaveLength(1);
  });

  it('retries generation after a failed save', async () => {
    const saved: DeviceKeyInfo[] = [];
    const state = { saveAttempts: 0 };
    const store: DeviceKeyStore = {
      async find() {
        return null;
      },
      async remove() {},
      async save(params) {
        state.saveAttempts += 1;
        if (state.saveAttempts === 1) {
          throw new Error('keychain locked');
        }
        saved.push(params.keyInfo);
      },
    };
    const service = new DeviceKeyService({ store });

    await expect(service.getOrCreate()).rejects.toThrow('keychain locked');

    const keyInfo = await service.getOrCreate();

    expect(keyInfo.publicKey.startsWith('ssh-ed25519 ')).toBe(true);
    expect(saved).toEqual([keyInfo]);
    expect(state.saveAttempts).toBe(2);
  });
});

describe('generateDeviceKey', () => {
  beforeEach(() => {
    Constants.expoConfig = { name: 'Relay', slug: 'relay' };
    deviceMock.deviceName = "Milos's iPhone";
    deviceMock.modelName = 'iPhone 17 Pro';
  });

  afterEach(() => {
    Constants.expoConfig = null;
    deviceMock.deviceName = null;
    deviceMock.modelName = null;
  });

  it('creates an ed25519 key pair named after the app, device and os', () => {
    const keyInfo = generateDeviceKey();

    expect(keyInfo.publicKey.startsWith('ssh-ed25519 ')).toBe(true);
    expect(keyInfo.publicKey.endsWith(keyInfo.comment)).toBe(true);
    expect(keyInfo.comment).toBe(`relay-beecode@miloss-iphone-${Platform.OS}`);
    expect(keyInfo.privateKey).toContain('OPENSSH PRIVATE KEY');
    expect(keyInfo.fingerprint.startsWith('SHA256:')).toBe(true);
    expect(keyInfo.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sanitizes the app name like the device name', () => {
    Constants.expoConfig = { name: 'Relay Studio!' } as unknown as typeof Constants.expoConfig;

    expect(generateDeviceKey().comment).toBe(`relay-studio-beecode@miloss-iphone-${Platform.OS}`);
  });

  it('removes special characters, lowercases and joins words with dashes', () => {
    deviceMock.deviceName = "John's  iPad Pro!";

    expect(generateDeviceKey().comment).toBe(`relay-beecode@johns-ipad-pro-${Platform.OS}`);
  });

  it('falls back to a generic device label when the name has no sanitizable characters', () => {
    deviceMock.deviceName = '***';
    deviceMock.modelName = null;

    expect(generateDeviceKey().comment).toBe(`relay-beecode@device-${Platform.OS}`);
  });

  it('falls back to the model name when the device name is unavailable', () => {
    deviceMock.deviceName = null;

    expect(generateDeviceKey().comment).toBe(`relay-beecode@iphone-17-pro-${Platform.OS}`);
  });

  it('falls back to a generic device label when no device identity is available', () => {
    deviceMock.deviceName = null;
    deviceMock.modelName = null;

    expect(generateDeviceKey().comment).toBe(`relay-beecode@device-${Platform.OS}`);
  });

  it('falls back to the slug when the app name is unavailable', () => {
    Constants.expoConfig = { slug: 'relay' } as unknown as typeof Constants.expoConfig;

    expect(generateDeviceKey().comment).toBe(`relay-beecode@miloss-iphone-${Platform.OS}`);
  });

  it('falls back to a default app name when the expo config is unavailable', () => {
    Constants.expoConfig = null;

    expect(generateDeviceKey().comment).toBe(`relay-beecode@miloss-iphone-${Platform.OS}`);
  });

  it('creates a different key material on each call with a stable comment', () => {
    const first = generateDeviceKey();
    const second = generateDeviceKey();

    expect(second.publicKey).not.toBe(first.publicKey);
    expect(second.privateKey).not.toBe(first.privateKey);
    expect(second.comment).toBe(first.comment);
  });
});
