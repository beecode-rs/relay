import { createMockSshBridge } from '@/services/terminal/mock-ssh-bridge';
import { remoteBrowseUtil } from '@/services/terminal/remote-browse';
import type { SshConnectOptions, SshRemoteDirEntry } from '@/services/terminal/ssh-terminal-types';

const toConnectOptions = (): SshConnectOptions => {
  return {
    acceptedHostKeys: [],
    auth: { kind: 'password', password: 'secret' },
    cols: 80,
    host: 'example.com',
    port: 22,
    rows: 24,
    username: 'user',
  };
};

describe('remoteBrowseUtil.toSubdirectoryNames', () => {
  it('keeps only directories sorted by name', () => {
    const entries: SshRemoteDirEntry[] = [
      { isDirectory: false, name: 'notes.txt' },
      { isDirectory: true, name: 'var' },
      { isDirectory: true, name: 'home' },
      { isDirectory: false, name: 'zzz.bin' },
    ];

    expect(remoteBrowseUtil.toSubdirectoryNames({ entries })).toEqual(['home', 'var']);
  });

  it('returns an empty list when no directories exist', () => {
    expect(remoteBrowseUtil.toSubdirectoryNames({ entries: [] })).toEqual([]);
  });
});

describe('remoteBrowseUtil.openSession', () => {
  it('connects once with the given options and lists directories through the port', async () => {
    const bridge = createMockSshBridge();
    const options = toConnectOptions();
    bridge.queueReadDirEntries([
      { isDirectory: true, name: 'projects' },
      { isDirectory: false, name: 'README.md' },
    ]);

    const session = await remoteBrowseUtil.openSession({ options, port: bridge });
    const names = await session.listDirectories({ path: '/home/user' });

    expect(names).toEqual(['projects']);
    expect(bridge.connectCalls).toEqual([options]);
    expect(bridge.readDirCalls).toEqual([{ path: '/home/user' }]);
  });

  it('disconnects the underlying port', async () => {
    const bridge = createMockSshBridge();

    const session = await remoteBrowseUtil.openSession({ options: toConnectOptions(), port: bridge });
    session.disconnect();

    expect(bridge.disconnectCount).toBe(1);
  });

  it('propagates connect failures', async () => {
    const bridge = createMockSshBridge();
    bridge.failNextConnect({ code: 'auth', message: 'Authentication failed' });

    await expect(remoteBrowseUtil.openSession({ options: toConnectOptions(), port: bridge })).rejects.toThrow(
      'Authentication failed'
    );
  });

  it('propagates listing failures', async () => {
    const bridge = createMockSshBridge();
    bridge.queueReadDirEntries(new Error('Permission denied'));

    const session = await remoteBrowseUtil.openSession({ options: toConnectOptions(), port: bridge });

    await expect(session.listDirectories({ path: '/root' })).rejects.toThrow('Permission denied');
  });
});
