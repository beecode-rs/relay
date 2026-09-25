import * as SecureStore from 'expo-secure-store';

import type { ServerProfileSecrets } from '@/services/connection/server-profile';

const KEY_KIND_PASSPHRASE = 'passphrase';
const KEY_KIND_PASSWORD = 'password';
const KEY_KIND_PRIVATE_KEY = 'private-key';
const KEY_PREFIX = 'server-credential-';

export type ServerCredentialStore = {
  find(params: { id: string }): Promise<ServerProfileSecrets | null>;
  save(params: { id: string; secrets: ServerProfileSecrets }): Promise<void>;
  remove(params: { id: string }): Promise<void>;
};

export class SecureStoreServerCredentialStore implements ServerCredentialStore {
  async find(params: { id: string }): Promise<ServerProfileSecrets | null> {
    const [passphrase, password, privateKey] = await Promise.all([
      this._readSecret({ id: params.id, kind: KEY_KIND_PASSPHRASE }),
      this._readSecret({ id: params.id, kind: KEY_KIND_PASSWORD }),
      this._readSecret({ id: params.id, kind: KEY_KIND_PRIVATE_KEY }),
    ]);
    if (!passphrase && !password && !privateKey) {
      return null;
    }

    return {
      passphrase: passphrase ?? undefined,
      password: password ?? undefined,
      privateKey: privateKey ?? undefined,
    };
  }

  async save(params: { id: string; secrets: ServerProfileSecrets }): Promise<void> {
    await this._writeSecret({ id: params.id, kind: KEY_KIND_PASSPHRASE, value: params.secrets.passphrase });
    await this._writeSecret({ id: params.id, kind: KEY_KIND_PASSWORD, value: params.secrets.password });
    await this._writeSecret({ id: params.id, kind: KEY_KIND_PRIVATE_KEY, value: params.secrets.privateKey });
  }

  async remove(params: { id: string }): Promise<void> {
    await this._deleteSecret({ id: params.id, kind: KEY_KIND_PASSPHRASE });
    await this._deleteSecret({ id: params.id, kind: KEY_KIND_PASSWORD });
    await this._deleteSecret({ id: params.id, kind: KEY_KIND_PRIVATE_KEY });
  }

  protected async _readSecret(params: { id: string; kind: string }): Promise<string | null> {
    return SecureStore.getItemAsync(this._entryKey(params));
  }

  protected async _writeSecret(params: { id: string; kind: string; value?: string }): Promise<void> {
    const key = this._entryKey(params);
    if (!params.value) {
      await SecureStore.deleteItemAsync(key);

      return;
    }
    await SecureStore.setItemAsync(key, params.value);
  }

  protected async _deleteSecret(params: { id: string; kind: string }): Promise<void> {
    await SecureStore.deleteItemAsync(this._entryKey(params));
  }

  protected _entryKey(params: { id: string; kind: string }): string {
    return `${KEY_PREFIX}${params.kind}-${params.id}`;
  }
}

export const serverCredentialStore: ServerCredentialStore = new SecureStoreServerCredentialStore();
