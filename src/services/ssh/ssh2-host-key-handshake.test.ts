import { readFileSync } from 'fs';
import { join } from 'path';

import { Server } from 'ssh2';

import { Ssh2ShellClientBase } from '@/services/ssh/ssh2-shell-client-base';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

const toHostKeyPem = (): string => {
  return readFileSync(join(__dirname, '../../../node_modules/ssh2/test/fixtures/ssh_host_ecdsa_key'), 'utf8');
};

const startServer = (): Promise<{ close: () => void; port: number }> => {
  return new Promise((resolve) => {
    const server = new Server({ hostKeys: [toHostKeyPem()] }, (client) => {
      // Client disconnects during KEX when host verification fails - no
      // authentication or session handling is needed.
      client.on('error', () => {
        return undefined;
      });
    });
    server.on('error', () => {
      return undefined;
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        close: () => {
          server.close();
        },
        port,
      });
    });
  });
};

const toConnectOptions = (params: { acceptedHostKeys: string[]; port: number }): SshConnectOptions => {
  return {
    acceptedHostKeys: params.acceptedHostKeys,
    auth: { kind: 'password', password: 'secret' },
    cols: 80,
    host: '127.0.0.1',
    port: params.port,
    rows: 24,
    username: 'user',
  };
};

describe('Ssh2ShellClientBase host-key handshake', () => {
  it('rejects with code, fingerprint and hostKeyLine when the stored host key does not match', async () => {
    const server = await startServer();
    try {
      const client = new Ssh2ShellClientBase();
      const pending = client.connect(
        toConnectOptions({
          acceptedHostKeys: [`[127.0.0.1]:${String(server.port)} ssh-ed25519 WRONGMATERIAL`],
          port: server.port,
        })
      );

      await expect(pending).rejects.toMatchObject({
        code: 'host-key-changed',
        fingerprint: expect.stringMatching(/^SHA256:/),
        hostKeyLine: expect.stringContaining(`[127.0.0.1]:${String(server.port)}`),
      });
    } finally {
      server.close();
    }
  });

  it('rejects with code, fingerprint and hostKeyLine when no host key is stored', async () => {
    const server = await startServer();
    try {
      const client = new Ssh2ShellClientBase();
      const pending = client.connect(toConnectOptions({ acceptedHostKeys: [], port: server.port }));

      await expect(pending).rejects.toMatchObject({
        code: 'host-key-unknown',
        fingerprint: expect.stringMatching(/^SHA256:/),
        hostKeyLine: expect.stringContaining(`[127.0.0.1]:${String(server.port)}`),
      });
    } finally {
      server.close();
    }
  });
});
