import type { SshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import type { SshConnectOptions, SshRemoteDirEntry } from '@/services/terminal/ssh-terminal-types';

export type RemoteBrowseSession = {
  listDirectories(params: { path: string }): Promise<string[]>;
  disconnect(): void;
};

export const remoteBrowseUtil = {
  toSubdirectoryNames(params: { entries: SshRemoteDirEntry[] }): string[] {
    return params.entries
      .filter((entry) => {
        return entry.isDirectory;
      })
      .map((entry) => {
        return entry.name;
      })
      .sort((left, right) => {
        if (left < right) {
          return -1;
        }
        if (left > right) {
          return 1;
        }

        return 0;
      });
  },

  async openSession(params: { port: SshTerminalPort; options: SshConnectOptions }): Promise<RemoteBrowseSession> {
    await params.port.connect(params.options);

    return {
      listDirectories: async (listParams: { path: string }) => {
        const entries = await params.port.readDir({ path: listParams.path });

        return remoteBrowseUtil.toSubdirectoryNames({ entries });
      },
      disconnect: () => {
        params.port.disconnect();
      },
    };
  },
};
