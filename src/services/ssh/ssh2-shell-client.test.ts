import { EventEmitter } from 'events';

import { Buffer } from 'buffer';
import type { Client, ClientChannel } from 'ssh2';

import { Ssh2ShellClientBase } from '@/services/ssh/ssh2-shell-client-base';
import type { SshBridgeErrorCode, SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

class ExposedClient extends Ssh2ShellClientBase {
  connectOnceResult: Promise<void> = new Promise(() => {
    return undefined;
  });

  classify(message: string): SshBridgeErrorCode {
    return this._classifyErrorCode(message);
  }

  emitClosed(reason: string): void {
    this._emitClosed(reason);
  }

  emitData(chunk: Buffer): void {
    this._emitData(chunk);
  }

  forceExecTarget(client: Client): void {
    this._client = client;
  }

  openShell(params: { client: Client; options: SshConnectOptions }): Promise<void> {
    return this._openShell(params);
  }

  protected override _connectOnce(): Promise<void> {
    return this.connectOnceResult;
  }
}

class FakeExecChannel extends EventEmitter {
  readonly stderr = new EventEmitter();
  closed = false;

  close(): void {
    this.closed = true;
    this.emit('close');
  }
}

class FakeShellChannel extends FakeExecChannel {
  readonly writes: string[] = [];

  write(data: string, callback?: (err?: Error) => void): void {
    this.writes.push(data);
    if (callback !== undefined) {
      callback();
    }
  }
}

const toClientChannel = (channel: FakeExecChannel): ClientChannel => {
  return channel as unknown as ClientChannel;
};

const createImmediateExecClient = (channel: FakeExecChannel): Client => {
  return {
    end: () => {
      return undefined;
    },
    exec: (_command: string, callback: (err: Error | undefined, execChannel: ClientChannel) => void) => {
      callback(undefined, toClientChannel(channel));
    },
  } as unknown as Client;
};

const createImmediateShellClient = (channel: FakeShellChannel): Client => {
  return {
    end: () => {
      return undefined;
    },
    shell: (
      _options: unknown,
      callback: (err: Error | undefined, shellChannel: ClientChannel) => void
    ) => {
      callback(undefined, toClientChannel(channel));
    },
  } as unknown as Client;
};

const CONNECT_OPTIONS = {
  acceptedHostKeys: [],
  auth: { kind: 'password' as const, password: 'secret' },
  cols: 80,
  host: 'example.com',
  port: 22,
  rows: 24,
  username: 'user',
};

describe('Ssh2ShellClientBase', () => {
  it('classifies authentication failures', () => {
    const client = new ExposedClient();

    expect(client.classify('All configured authentication methods failed')).toBe('auth');
    expect(client.classify('Cannot parse privateKey: invalid')).toBe('auth');
  });

  it('classifies timeout failures', () => {
    const client = new ExposedClient();

    expect(client.classify('Timed out while waiting for handshake')).toBe('timeout');
    expect(client.classify('connect ETIMEDOUT 1.2.3.4:22')).toBe('timeout');
  });

  it('classifies network failures', () => {
    const client = new ExposedClient();

    expect(client.classify('connect ECONNREFUSED 127.0.0.1:22')).toBe('network');
    expect(client.classify('getaddrinfo ENOTFOUND example.com')).toBe('network');
  });

  it('falls back to unknown for unmatched messages', () => {
    const client = new ExposedClient();

    expect(client.classify('something unexpected')).toBe('unknown');
  });

  it('rejects connect while another connection is in progress and resets phase on failure', async () => {
    const client = new ExposedClient();
    const deferred: { reject: (error: Error) => void } = {
      reject: () => {
        return undefined;
      },
    };
    client.connectOnceResult = new Promise<void>((_resolve, reject) => {
      deferred.reject = reject;
    });
    const pending = client.connect(CONNECT_OPTIONS);

    await expect(client.connect(CONNECT_OPTIONS)).rejects.toThrow('already in progress');
    deferred.reject(new Error('handshake failed'));
    await expect(pending).rejects.toThrow('handshake failed');
  });

  it('rejects write when no channel is established', async () => {
    const client = new ExposedClient();

    await expect(client.write('ls')).rejects.toThrow('not established');
  });

  it('ignores resize when no channel is established', async () => {
    const client = new ExposedClient();

    await expect(client.resize(100, 30)).resolves.toBeUndefined();
  });

  it('decodes utf8 data across split multibyte sequences', () => {
    const client = new ExposedClient();
    const values: string[] = [];
    client.addListener('data', (event) => {
      values.push(event.value);
    });

    client.emitData(Buffer.from('he', 'utf8'));
    client.emitData(Buffer.from([0xf0, 0x9f, 0x98]));
    client.emitData(Buffer.from([0x80, 0x21]));

    expect(values).toEqual(['he', '😀!']);
  });

  it('delivers closed events and removes listeners', () => {
    const client = new ExposedClient();
    const reasons: string[] = [];
    const subscription = client.addListener('closed', (event) => {
      reasons.push(event.reason);
    });

    client.emitClosed('eof');
    subscription.remove();
    client.emitClosed('disconnected');

    expect(reasons).toEqual(['eof']);
  });

  it('is supported on every platform', () => {
    expect(new ExposedClient().isSupported).toBe(true);
  });
});

const createFailingShellClient = (): Client => {
  return {
    end: () => {
      return undefined;
    },
    shell: (
      _options: unknown,
      callback: (err: Error | undefined, shellChannel: ClientChannel) => void
    ) => {
      callback(new Error('shell failed'), undefined as unknown as ClientChannel);
    },
  } as unknown as Client;
};

describe('Ssh2ShellClientBase.openShell', () => {
  it('rejects with a classified error when the shell channel cannot be opened', async () => {
    const client = new ExposedClient();
    const failingClient = createFailingShellClient();
    client.forceExecTarget(failingClient);

    await expect(client.openShell({ client: failingClient, options: CONNECT_OPTIONS })).rejects.toThrow(
      'shell failed'
    );
  });

  it('rejects with the shell error instead of throwing when a stale client fails to open a channel', async () => {
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateShellClient(new FakeShellChannel()));

    await expect(client.openShell({ client: createFailingShellClient(), options: CONNECT_OPTIONS })).rejects.toThrow(
      'shell failed'
    );
  });

  it('closes the channel and rejects as cancelled when the client was replaced', async () => {
    const channel = new FakeShellChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateShellClient(new FakeShellChannel()));

    await expect(client.openShell({ client: createImmediateShellClient(channel), options: CONNECT_OPTIONS })).rejects.toThrow(
      'cancelled'
    );
    expect(channel.closed).toBe(true);
  });
});

describe('Ssh2ShellClientBase.exec', () => {  it('rejects exec when no connection is established', async () => {
    const client = new ExposedClient();

    await expect(client.exec('probe')).rejects.toThrow('not established');
  });

  it('collects stdout, stderr and the exit code, resolving on close', async () => {
    const channel = new FakeExecChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateExecClient(channel));
    const pending = client.exec('probe');
    channel.emit('data', Buffer.from('tmux=missing\n'));
    channel.stderr.emit('data', Buffer.from('warning\n'));
    channel.emit('exit', 0);
    channel.close();

    await expect(pending).resolves.toEqual({ exitCode: 0, stderr: 'warning\n', stdout: 'tmux=missing\n' });
  });

  it('keeps the shell decoder isolated from the exec channel decoder', async () => {
    const channel = new FakeExecChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateExecClient(channel));
    const shellValues: string[] = [];
    client.addListener('data', (event) => {
      shellValues.push(event.value);
    });
    const pending = client.exec('probe');
    channel.emit('data', Buffer.from([0xf0, 0x9f, 0x98]));
    client.emitData(Buffer.from([0xf0, 0x9f, 0x98, 0x80, 0x21]));
    channel.close();
    await pending;

    expect(shellValues).toEqual(['😀!']);
  });

  it('rejects on an exec error without surfacing bridge error events', async () => {
    const errorEvents: { code: string; message: string }[] = [];
    const client = new ExposedClient();
    client.addListener('error', (event) => {
      errorEvents.push(event);
    });
    client.forceExecTarget({
      end: () => {
        return undefined;
      },
      exec: (_command: string, callback: (err: Error | undefined, execChannel: ClientChannel) => void) => {
        callback(new Error('exec failed'), undefined as unknown as ClientChannel);
      },
    } as unknown as Client);

    await expect(client.exec('probe')).rejects.toThrow('exec failed');
    expect(errorEvents).toEqual([]);
  });

  it('times out when the exec channel never closes', async () => {
    jest.useFakeTimers();
    const channel = new FakeExecChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateExecClient(channel));
    const pending = client.exec('probe');
    const assertion = expect(pending).rejects.toThrow('timed out');
    jest.advanceTimersByTime(10001);
    await assertion;
    expect(channel.closed).toBe(true);
    jest.useRealTimers();
  });

  it('rejects a stale exec channel after teardown without surfacing closed events', async () => {
    const closedReasons: string[] = [];
    const channel = new FakeExecChannel();
    const client = new ExposedClient();
    client.addListener('closed', (event) => {
      closedReasons.push(event.reason);
    });
    client.forceExecTarget(createImmediateExecClient(channel));
    const pending = client.exec('probe');
    client.disconnect();
    channel.close();

    await expect(pending).rejects.toThrow('cancelled');
    expect(closedReasons).toEqual([]);
  });
});

describe('Ssh2ShellClientBase.runInLoginShell', () => {
  it('rejects when no connection is established', async () => {
    const client = new ExposedClient();

    await expect(client.runInLoginShell('tmux list-sessions')).rejects.toThrow('not established');
  });

  it('writes the command with a sentinel echo and exit, then resolves on the sentinel', async () => {
    const channel = new FakeShellChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateShellClient(channel));
    const pending = client.runInLoginShell('tmux list-sessions');

    expect(channel.writes).toEqual(['tmux list-sessions\recho __cmh_shell_"done"__\rexit\r']);
    channel.emit('data', Buffer.from('echo __cmh_shell_"done"__\r\n__cmh_shell_done__\r\n'));
    await expect(pending).resolves.toBeUndefined();
    expect(channel.closed).toBe(true);
  });

  it('resolves once the shell closes even without seeing the sentinel', async () => {
    const channel = new FakeShellChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateShellClient(channel));
    const pending = client.runInLoginShell('tmux list-sessions');

    channel.close();
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when the shell channel cannot be opened', async () => {
    const client = new ExposedClient();
    client.forceExecTarget({
      end: () => {
        return undefined;
      },
      shell: (
        _options: unknown,
        callback: (err: Error | undefined, shellChannel: ClientChannel) => void
      ) => {
        callback(new Error('shell failed'), undefined as unknown as ClientChannel);
      },
    } as unknown as Client);

    await expect(client.runInLoginShell('tmux list-sessions')).rejects.toThrow('shell failed');
  });

  it('times out when the login shell never closes', async () => {
    jest.useFakeTimers();
    const channel = new FakeShellChannel();
    const client = new ExposedClient();
    client.forceExecTarget(createImmediateShellClient(channel));
    const pending = client.runInLoginShell('tmux list-sessions');
    const assertion = expect(pending).rejects.toThrow('timed out');
    jest.advanceTimersByTime(20001);
    await assertion;
    expect(channel.closed).toBe(true);
    jest.useRealTimers();
  });

  it('rejects a stale login shell after teardown without surfacing closed events', async () => {
    const closedReasons: string[] = [];
    const channel = new FakeShellChannel();
    const client = new ExposedClient();
    client.addListener('closed', (event) => {
      closedReasons.push(event.reason);
    });
    client.forceExecTarget(createImmediateShellClient(channel));
    const pending = client.runInLoginShell('tmux list-sessions');
    client.disconnect();
    channel.close();

    await expect(pending).rejects.toThrow('cancelled');
    expect(closedReasons).toEqual([]);
  });
});

class FakeSftpSession extends EventEmitter {
  readonly readdirCalls: string[] = [];
  failNextReaddir: Error | null = null;

  readdir(path: string, callback: (err: Error | undefined, list: unknown[]) => void): void {
    this.readdirCalls.push(path);
    if (this.failNextReaddir !== null) {
      callback(this.failNextReaddir, []);
      this.failNextReaddir = null;

      return;
    }
    callback(undefined, [
      { attrs: { isDirectory: () => true }, filename: 'home' },
      { attrs: { isDirectory: () => false }, filename: 'notes.txt' },
      { attrs: { isDirectory: () => true }, filename: '.' },
      { attrs: { isDirectory: () => true }, filename: '..' },
    ]);
  }
}

const createSftpClient = (params: { sftp: FakeSftpSession | Error }): Client => {
  return {
    end: () => {
      return undefined;
    },
    sftp: (callback: (err: Error | undefined, sftpSession: unknown) => void) => {
      if (params.sftp instanceof Error) {
        callback(params.sftp, undefined);

        return;
      }
      callback(undefined, params.sftp);
    },
  } as unknown as Client;
};

describe('Ssh2ShellClientBase.readDir', () => {
  it('rejects when no connection is established', async () => {
    const client = new ExposedClient();

    await expect(client.readDir({ path: '/home' })).rejects.toThrow('not established');
  });

  it('maps sftp entries and drops the dot entries', async () => {
    const sftp = new FakeSftpSession();
    const client = new ExposedClient();
    client.forceExecTarget(createSftpClient({ sftp }));

    const entries = await client.readDir({ path: '/home' });

    expect(entries).toEqual([
      { isDirectory: true, name: 'home' },
      { isDirectory: false, name: 'notes.txt' },
    ]);
    expect(sftp.readdirCalls).toEqual(['/home']);
  });

  it('reuses one sftp session across listings', async () => {
    const sftp = new FakeSftpSession();
    const sftpOpenings: FakeSftpSession[] = [];
    const client = new ExposedClient();
    client.forceExecTarget({
      end: () => {
        return undefined;
      },
      sftp: (callback: (err: Error | undefined, sftpSession: unknown) => void) => {
        sftpOpenings.push(sftp);
        callback(undefined, sftp);
      },
    } as unknown as Client);

    await client.readDir({ path: '/' });
    await client.readDir({ path: '/home' });

    expect(sftpOpenings).toHaveLength(1);
    expect(sftp.readdirCalls).toEqual(['/', '/home']);
  });

  it('rejects when the sftp session cannot be opened', async () => {
    const client = new ExposedClient();
    client.forceExecTarget(createSftpClient({ sftp: new Error('sftp failed') }));

    await expect(client.readDir({ path: '/home' })).rejects.toThrow('sftp failed');
  });

  it('rejects when the directory listing fails', async () => {
    const sftp = new FakeSftpSession();
    sftp.failNextReaddir = new Error('Permission denied');
    const client = new ExposedClient();
    client.forceExecTarget(createSftpClient({ sftp }));

    await expect(client.readDir({ path: '/root' })).rejects.toThrow('Permission denied');
  });

  it('opens a fresh sftp session after the cached one closes', async () => {
    const sftp = new FakeSftpSession();
    const openings: FakeSftpSession[] = [];
    const client = new ExposedClient();
    client.forceExecTarget({
      end: () => {
        return undefined;
      },
      sftp: (callback: (err: Error | undefined, sftpSession: unknown) => void) => {
        openings.push(sftp);
        callback(undefined, sftp);
      },
    } as unknown as Client);

    await client.readDir({ path: '/' });
    sftp.emit('close');
    await client.readDir({ path: '/home' });

    expect(openings).toHaveLength(2);
  });
});
