import { Ssh2ShellClientBase } from '@/services/ssh/ssh2-shell-client-base';
import { tcpSocketNodeCompat } from '@/lib/tcp-socket-node-compat';

tcpSocketNodeCompat.install();

export class Ssh2ShellClient extends Ssh2ShellClientBase {}

export const createSsh2ShellClient = (): Ssh2ShellClient => {
  return new Ssh2ShellClient();
};
