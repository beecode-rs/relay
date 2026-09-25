import { type ConnectConfig } from 'ssh2';

import { config } from '@/constants/config';
import { WebsocketStream } from '@/lib/websocket-stream';
import { Ssh2ShellClientBase } from '@/services/ssh/ssh2-shell-client-base';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

const WEB_ALGORITHMS: ConnectConfig['algorithms'] = {
  cipher: ['aes256-gcm@openssh.com', 'aes128-gcm@openssh.com', 'aes256-ctr', 'aes192-ctr', 'aes128-ctr'],
  hmac: ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512-etm@openssh.com', 'hmac-sha2-512'],
  serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ssh-rsa'],
};

export class Ssh2ShellClient extends Ssh2ShellClientBase {
  protected override _toConnectConfig(options: SshConnectOptions): ConnectConfig {
    const config = super._toConnectConfig(options);

    return {
      ...config,
      algorithms: WEB_ALGORITHMS,
      sock: new WebsocketStream({ url: this._buildRelayUrl(options) }),
    };
  }

  protected _buildRelayUrl(options: SshConnectOptions): string {
    const target = `?host=${encodeURIComponent(options.host)}&port=${String(options.port)}`;

    return `${config.sshRelayUrl}${target}`;
  }
}

export const createSsh2ShellClient = (): Ssh2ShellClient => {
  return new Ssh2ShellClient();
};
