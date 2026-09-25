import { constant } from '@/constants/constant';
import { serverCredentialStore } from '@/services/connection/credential-store';
import type { DeviceKeyInfo } from '@/services/connection/device-key';
import { deviceKeyService } from '@/services/connection/device-key';
import { serverLastSessionStore } from '@/services/connection/server-last-session-store';
import { serverProfileStore } from '@/services/connection/server-profile-store';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';


export const serverConnectOptions = {
  async build(params: { id: string }): Promise<SshConnectOptions | null> {
    const profile = await serverProfileStore.findById({ id: params.id });
    if (profile === null) {
      return null;
    }
    const lastTmuxSessionName = await serverLastSessionStore.find({ id: profile.id });
    const secrets = await serverCredentialStore.find({ id: profile.id });
    if (profile.authMethod === 'password') {
      if (!secrets?.password) {
        return null;
      }

      return this._toConnectOptions({
        acceptedHostKeys: profile.acceptedHostKeys,
        auth: { kind: 'password', password: secrets.password },
        host: profile.host,
        label: profile.label,
        lastTmuxSessionName: lastTmuxSessionName ?? undefined,
        port: profile.port,
        remotePath: profile.remotePath,
        username: profile.username,
      });
    }
    if (profile.authMethod === 'deviceKey') {
      const deviceKey = await this._findDeviceKey();
      if (deviceKey === null) {
        return null;
      }

      return this._toConnectOptions({
        acceptedHostKeys: profile.acceptedHostKeys,
        auth: { kind: 'privateKey', privateKey: deviceKey.privateKey },
        host: profile.host,
        label: profile.label,
        lastTmuxSessionName: lastTmuxSessionName ?? undefined,
        port: profile.port,
        remotePath: profile.remotePath,
        username: profile.username,
      });
    }
    if (!secrets?.privateKey) {
      return null;
    }

    return this._toConnectOptions({
      acceptedHostKeys: profile.acceptedHostKeys,
      auth: { kind: 'privateKey', passphrase: secrets.passphrase, privateKey: secrets.privateKey },
      host: profile.host,
      label: profile.label,
      lastTmuxSessionName: lastTmuxSessionName ?? undefined,
      port: profile.port,
      remotePath: profile.remotePath,
      username: profile.username,
    });
  },

  async _findDeviceKey(): Promise<DeviceKeyInfo | null> {
    try {
      return await deviceKeyService.find();
    } catch (error) {
      console.warn('[device-key] unavailable for connect:', error);

      return null;
    }
  },

  _toConnectOptions(params: {
    acceptedHostKeys: string[];
    auth: SshConnectOptions['auth'];
    host: string;
    label?: string;
    lastTmuxSessionName?: string;
    port: number;
    remotePath?: string;
    username: string;
  }): SshConnectOptions {
    return {
      acceptedHostKeys: params.acceptedHostKeys,
      auth: params.auth,
      cols: constant.terminal.initialSize.cols,
      host: params.host,
      label: params.label,
      lastTmuxSessionName: params.lastTmuxSessionName,
      port: params.port,
      remotePath: params.remotePath,
      rows: constant.terminal.initialSize.rows,
      username: params.username,
    };
  },
};
