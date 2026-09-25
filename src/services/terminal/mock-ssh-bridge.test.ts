import { createMockSshBridge } from '@/services/terminal/mock-ssh-bridge';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

const profile: SshConnectOptions = {
  host: 'example.com',
  port: 22,
  username: 'user',
  auth: { kind: 'password', password: 'secret' },
  cols: 80,
  rows: 24,
  acceptedHostKeys: [],
};

describe('createMockSshBridge', () => {
  it('resolves connect and records the call', async () => {
    const bridge = createMockSshBridge();
    await bridge.connect(profile);
    expect(bridge.connectCalls).toEqual([profile]);
  });

  it('throws the next scripted failure with typed host-key fields', async () => {
    const bridge = createMockSshBridge();
    bridge.failNextConnect({
      code: 'host-key-unknown',
      message: 'no record',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 AAAA',
    });
    await expect(bridge.connect(profile)).rejects.toMatchObject({
      code: 'host-key-unknown',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 AAAA',
    });
    await bridge.connect(profile);
    expect(bridge.connectCalls).toHaveLength(2);
  });

  it('records writes, resizes and disconnects', async () => {
    const bridge = createMockSshBridge();
    await bridge.write('ls\r');
    await bridge.resize(100, 30);
    bridge.disconnect();
    expect(bridge.written).toEqual(['ls\r']);
    expect(bridge.resizes).toEqual([{ cols: 100, rows: 30 }]);
    expect(bridge.disconnectCount).toBe(1);
  });

  it('records readDir calls and returns queued entries', async () => {
    const bridge = createMockSshBridge();
    bridge.queueReadDirEntries([
      { isDirectory: true, name: 'home' },
      { isDirectory: false, name: 'boot' },
    ]);

    const entries = await bridge.readDir({ path: '/' });

    expect(entries).toEqual([
      { isDirectory: true, name: 'home' },
      { isDirectory: false, name: 'boot' },
    ]);
    expect(bridge.readDirCalls).toEqual([{ path: '/' }]);
  });

  it('returns an empty listing when nothing is queued and throws queued errors', async () => {
    const bridge = createMockSshBridge();

    await expect(bridge.readDir({ path: '/home' })).resolves.toEqual([]);
    bridge.queueReadDirEntries(new Error('Permission denied'));
    await expect(bridge.readDir({ path: '/root' })).rejects.toThrow('Permission denied');
  });

  it('delivers data, closed and error events to listeners', () => {
    const bridge = createMockSshBridge();
    const received: string[] = [];
    const closedReasons: string[] = [];
    const errorCodes: string[] = [];
    bridge.addListener('data', (event) => {
      received.push(event.value);
    });
    bridge.addListener('closed', (event) => {
      closedReasons.push(event.reason);
    });
    bridge.addListener('error', (event) => {
      errorCodes.push(event.code);
    });
    bridge.emitData('chunk');
    bridge.emitClosed('eof');
    bridge.emitError({ code: 'network', message: 'reset' });
    expect(received).toEqual(['chunk']);
    expect(closedReasons).toEqual(['eof']);
    expect(errorCodes).toEqual(['network']);
  });

  it('stops delivering after a subscription is removed', () => {
    const bridge = createMockSshBridge();
    const received: string[] = [];
    const subscription = bridge.addListener('data', (event) => {
      received.push(event.value);
    });
    bridge.emitData('first');
    subscription.remove();
    bridge.emitData('second');
    expect(received).toEqual(['first']);
  });

  it('clears every listener on removeListeners', () => {
    const bridge = createMockSshBridge();
    const received: string[] = [];
    bridge.addListener('data', (event) => {
      received.push(event.value);
    });
    bridge.removeListeners();
    bridge.emitData('dropped');
    expect(received).toEqual([]);
  });

  it('does not emit closed on a local disconnect', () => {
    const bridge = createMockSshBridge();
    const closedReasons: string[] = [];
    bridge.addListener('closed', (event) => {
      closedReasons.push(event.reason);
    });
    bridge.disconnect();
    expect(bridge.disconnectCount).toBe(1);
    expect(closedReasons).toEqual([]);
  });

  it('resolves exec with the default present result and records the command', async () => {
    const bridge = createMockSshBridge();
    const result = await bridge.exec('command -v tmux');
    expect(bridge.execCalls).toEqual(['command -v tmux']);
    expect(result).toEqual({ exitCode: 0, stderr: '', stdout: '' });
  });

  it('serves queued exec results in fifo order and rejects queued errors', async () => {
    const bridge = createMockSshBridge();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    bridge.queueExecResult(new Error('exec channel refused'));
    await expect(bridge.exec('first')).resolves.toEqual({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await expect(bridge.exec('second')).rejects.toThrow('exec channel refused');
    expect(bridge.execCalls).toEqual(['first', 'second']);
  });

  it('resolves a deferred exec when its controls fire', async () => {
    const bridge = createMockSshBridge();
    const controls = bridge.deferNextExec();
    const pending = bridge.exec('probe');
    controls.resolve({ exitCode: 1, stderr: 'warn', stdout: '' });
    await expect(pending).resolves.toEqual({ exitCode: 1, stderr: 'warn', stdout: '' });
  });

  it('records login shell commands', async () => {
    const bridge = createMockSshBridge();
    await bridge.runInLoginShell('tmux list-sessions');
    expect(bridge.loginShellCalls).toEqual(['tmux list-sessions']);
  });
});
