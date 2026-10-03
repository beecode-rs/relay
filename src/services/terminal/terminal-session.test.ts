import { createMockSshBridge } from '@/services/terminal/mock-ssh-bridge';
import type { MockSshBridge } from '@/services/terminal/mock-ssh-bridge';
import { createTerminalEmulator } from '@/services/terminal/terminal-emulator';
import type { TerminalEmulator } from '@/services/terminal/terminal-emulator';
import { TerminalSession } from '@/services/terminal/terminal-session';
import type { TerminalSessionState, TerminalSessionStatus } from '@/services/terminal/terminal-session';
import { tmuxAttachUtil } from '@/services/terminal/tmux-attach';
import { tmuxCheckUtil } from '@/services/terminal/tmux-check';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

jest.mock('react-native', () => {
  return { Platform: { OS: 'android' } };
});

const profile: SshConnectOptions = {
  host: 'example.com',
  port: 22,
  username: 'user',
  auth: { kind: 'password', password: 'secret' },
  cols: 80,
  rows: 24,
  acceptedHostKeys: [],
};

type TestHarness = {
  bridge: MockSshBridge;
  getEmulator: () => TerminalEmulator;
  session: TerminalSession;
};

const createHarness = (): TestHarness => {
  const bridge = createMockSshBridge();
  const created = { emulator: undefined as TerminalEmulator | undefined };
  const session = new TerminalSession({
    port: bridge,
    createEmulator: (params) => {
      const emulator = createTerminalEmulator(params);
      created.emulator = emulator;
      return emulator;
    },
  });
  return {
    bridge,
    getEmulator: () => {
      return created.emulator as TerminalEmulator;
    },
    session,
  };
};

const waitForEmulatorWrites = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('TerminalSession.start', () => {
  it('moves through connecting to connected', async () => {
    const { session } = createHarness();
    const statuses: TerminalSessionStatus[] = [];
    session.subscribe((state) => {
      statuses.push(state.status);
    });
    await session.start(profile);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(session.status).toBe('connected');
  });

  it('feeds data events into the emulator and the batcher', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitData('hello ');
    bridge.emitData('world');
    await waitForEmulatorWrites();
    expect(session.snapshot().rows[0]?.segments[0]?.text).toBe('hello world');
    expect(session.snapshot().cursor).toEqual({ x: 11, y: 0 });
    expect(session.drainPendingOutput()).toBe('hello world');
    expect(session.drainPendingOutput()).toBeNull();
  });

  it('tracks DECCKM from the output stream', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitData('\x1b[?1h');
    expect(session.isApplicationCursorKeys).toBe(true);
    bridge.emitData('\x1b[?1l');
    expect(session.isApplicationCursorKeys).toBe(false);
  });

  it('surfaces typed errors for non-host-key failures', async () => {
    const { bridge, session } = createHarness();
    const states: TerminalSessionState[] = [];
    session.subscribe((state) => {
      states.push(state);
    });
    bridge.failNextConnect({ code: 'auth', message: 'bad credentials' });
    await session.start(profile);
    expect(session.status).toBe('error');
    expect(states[states.length - 1]?.error).toEqual({ code: 'auth', message: 'bad credentials' });
  });
});

describe('TerminalSession host-key handling', () => {
  it('surfaces a pending host key and reconnects after acceptHostKey', async () => {
    const { bridge, session } = createHarness();
    bridge.failNextConnect({
      code: 'host-key-unknown',
      message: 'no matching host key',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 AAAAB3NzaC1yc2E=',
    });
    await session.start(profile);
    expect(session.status).toBe('host-key-unknown');
    expect(bridge.connectCalls).toHaveLength(1);
    session.acceptHostKey();
    await waitForEmulatorWrites();
    expect(bridge.connectCalls).toHaveLength(2);
    expect(bridge.connectCalls[1]?.acceptedHostKeys).toEqual(['example.com ssh-ed25519 AAAAB3NzaC1yc2E=']);
    expect(session.status).toBe('connected');
  });

  it('replaces the stored line for the host on host-key-changed', async () => {
    const { bridge, session } = createHarness();
    const staleProfile: SshConnectOptions = {
      ...profile,
      acceptedHostKeys: ['example.com ssh-ed25519 OLDKEY', 'other.example ssh-ed25519 KEEP'],
    };
    bridge.failNextConnect({
      code: 'host-key-changed',
      message: 'host key changed',
      fingerprint: 'SHA256:def',
      hostKeyLine: 'example.com ssh-ed25519 NEWKEY',
    });
    await session.start(staleProfile);
    expect(session.status).toBe('host-key-changed');
    session.acceptHostKey();
    await waitForEmulatorWrites();
    expect(bridge.connectCalls[1]?.acceptedHostKeys).toEqual([
      'other.example ssh-ed25519 KEEP',
      'example.com ssh-ed25519 NEWKEY',
    ]);
    expect(session.status).toBe('connected');
  });

  it('moves to an error state after rejectHostKey', async () => {
    const { bridge, session } = createHarness();
    bridge.failNextConnect({
      code: 'host-key-unknown',
      message: 'no matching host key',
      fingerprint: 'SHA256:abc',
      hostKeyLine: 'example.com ssh-ed25519 AAAAB3NzaC1yc2E=',
    });
    await session.start(profile);
    session.rejectHostKey();
    expect(session.status).toBe('error');
    expect(bridge.connectCalls).toHaveLength(1);
  });
});

describe('TerminalSession.write and resize', () => {
  it('writes input through the bridge while connected', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    session.write('ls\r');
    expect(bridge.written).toEqual(['ls\r']);
  });

  it('ignores input while not connected', async () => {
    const { bridge, session } = createHarness();
    session.write('dropped');
    expect(bridge.written).toEqual([]);
    await session.start(profile);
    bridge.failNextConnect({ code: 'auth', message: 'bad credentials' });
    await session.start(profile);
    session.write('also dropped');
    expect(bridge.written).toEqual([]);
  });

  it('resizes both the emulator and the bridge while connected', async () => {
    const { bridge, getEmulator, session } = createHarness();
    await session.start(profile, { cols: 80, rows: 24 });
    session.resize({ cols: 120, rows: 40 });
    expect(getEmulator().cols).toBe(120);
    expect(getEmulator().rows).toBe(40);
    expect(bridge.resizes).toEqual([{ cols: 120, rows: 40 }]);
  });

  it('resizes only the emulator while not connected', async () => {
    const { bridge, getEmulator, session } = createHarness();
    await session.start(profile, { cols: 80, rows: 24 });
    bridge.emitClosed('eof');
    session.resize({ cols: 100, rows: 30 });
    expect(getEmulator().cols).toBe(100);
    expect(bridge.resizes).toEqual([]);
  });

  it('keeps the last size when a reconnect passes no explicit size', async () => {
    const { bridge, getEmulator, session } = createHarness();
    await session.start(profile, { cols: 80, rows: 24 });
    session.resize({ cols: 110, rows: 35 });
    bridge.emitClosed('eof');
    await session.start(profile);
    expect(getEmulator().cols).toBe(110);
    expect(getEmulator().rows).toBe(35);
    expect(bridge.connectCalls[1]?.cols).toBe(110);
    expect(bridge.connectCalls[1]?.rows).toBe(35);
  });
});

describe('TerminalSession lifecycle', () => {
  it('moves to closed on end', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    session.end();
    expect(session.status).toBe('closed');
    expect(session.isActiveFor(profile)).toBe(false);
    expect(bridge.disconnectCount).toBe(1);
  });

  it('exposes the current state to late subscribers', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    expect(session.currentState).toEqual({ status: 'connected' });
    bridge.emitError({ code: 'network', message: 'socket reset' });
    expect(session.currentState).toEqual({
      status: 'error',
      error: { code: 'network', message: 'socket reset' },
    });
  });

  it('is active for the profile it is connecting to', async () => {
    const { session } = createHarness();
    expect(session.isActiveFor(profile)).toBe(false);
    await session.start(profile);
    expect(session.isActiveFor(profile)).toBe(true);
  });

  it('is not active for a different profile identity', async () => {
    const { session } = createHarness();
    await session.start(profile);
    expect(session.isActiveFor({ ...profile, host: 'other.example.com' })).toBe(false);
    expect(session.isActiveFor({ ...profile, username: 'other-user' })).toBe(false);
  });

  it('is not active for any profile once closed', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitClosed('eof');
    expect(session.isActiveFor(profile)).toBe(false);
  });

  it('does not disconnect when no connection was attempted', () => {
    const { bridge, session } = createHarness();
    session.end();
    expect(bridge.disconnectCount).toBe(0);
  });

  it('moves to error on a runtime bridge error event', async () => {
    const { bridge, session } = createHarness();
    const states: TerminalSessionState[] = [];
    session.subscribe((state) => {
      states.push(state);
    });
    await session.start(profile);
    bridge.emitError({ code: 'network', message: 'socket reset' });
    expect(session.status).toBe('error');
    expect(states[states.length - 1]?.error).toEqual({ code: 'network', message: 'socket reset' });
  });

  it('returns an empty snapshot before the first start', () => {
    const { session } = createHarness();
    expect(session.snapshot()).toEqual({
      rows: [],
      cursor: { x: 0, y: 0 },
      firstLine: 0,
      isAlternateBuffer: false,
      viewportRowCount: 0,
    });
  });

  it('stops notifying after a listener unsubscribes', async () => {
    const { session } = createHarness();
    const statuses: TerminalSessionStatus[] = [];
    const unsubscribe = session.subscribe((state) => {
      statuses.push(state.status);
    });
    unsubscribe();
    await session.start(profile);
    expect(statuses).toEqual([]);
  });
});

describe('TerminalSession tmux check', () => {
  it('prompts with the sudo install command when tmux is missing', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\npm=apt-get\nuid=1000\n' });
    await session.start(profile);
    expect(bridge.execCalls).toEqual([tmuxCheckUtil.probeScript]);
    expect(session.currentState).toEqual({
      status: 'connected',
      tmuxPrompt: { installCommand: 'sudo apt-get update && sudo apt-get install -y tmux' },
    });
  });

  it('omits sudo when the remote user is root', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\npm=apk\nuid=0\n' });
    await session.start(profile);
    expect(session.currentState.tmuxPrompt).toEqual({ installCommand: 'apk add tmux' });
  });

  it('writes the attach command when tmux is present', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({
      exitCode: 0,
      stderr: '',
      stdout: 'tmux=present\npm=apt-get\nuid=1000\nts=work\nts=other01-play\n',
    });
    await session.start(profile);
    await waitForEmulatorWrites();
    expect(bridge.written).toEqual([`${tmuxAttachUtil.toCommand({})}\r`]);
    expect(session.currentState).toEqual({ status: 'connected' });
  });

  it('writes the same attach command when tmux is present without sessions', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=present\npm=apt-get\nuid=1000\n' });
    await session.start(profile);
    await waitForEmulatorWrites();
    expect(bridge.written).toEqual([`${tmuxAttachUtil.toCommand({})}\r`]);
    expect(session.currentState).toEqual({ status: 'connected' });
  });

  it('writes the attach command with the start directory from the profile remote path', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=present\npm=apt-get\nuid=1000\n' });
    await session.start({ ...profile, remotePath: '/srv/app' });
    await waitForEmulatorWrites();
    expect(bridge.written).toEqual([`${tmuxAttachUtil.toCommand({ startPath: '/srv/app' })}\r`]);
  });

  it('writes the attach command preferring the remembered session', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=present\npm=apt-get\nuid=1000\n' });
    await session.start({ ...profile, lastTmuxSessionName: 'work' });
    await waitForEmulatorWrites();
    expect(bridge.written).toEqual([`${tmuxAttachUtil.toCommand({ preferredSessionName: 'work' })}\r`]);
  });

  it('still attaches when the session list refresh races the in-flight probe', async () => {
    const { bridge, session } = createHarness();
    const controls = bridge.deferNextExec();
    await session.start(profile);
    const listPromise = session.listTmuxSessions();
    controls.resolve({ exitCode: 0, stderr: '', stdout: 'tmux=present\npm=apt-get\nuid=1000\n' });
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'rc=0\nts=work\ncs=work\n' });
    const result = await listPromise;
    await waitForEmulatorWrites();
    expect(bridge.written).toEqual([`${tmuxAttachUtil.toCommand({})}\r`]);
    expect(result).toEqual({ kind: 'sessions', currentSessionName: 'work', sessionNames: ['work'] });
  });

  it('does not attach when the tmux status is unknown', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    await waitForEmulatorWrites();
    expect(bridge.written).toEqual([]);
    expect(session.currentState).toEqual({ status: 'connected' });
  });

  it('stays silent when the probe output cannot be parsed', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'This account is restricted\n' });
    await session.start(profile);
    expect(session.currentState).toEqual({ status: 'connected' });
  });

  it('stays silent when the exec channel fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult(new Error('exec channel refused'));
    await session.start(profile);
    expect(session.currentState).toEqual({ status: 'connected' });
  });

  it('clears the prompt on dismissTmuxPrompt', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\npm=apt-get\nuid=1000\n' });
    await session.start(profile);
    session.dismissTmuxPrompt();
    expect(session.currentState).toEqual({ status: 'connected' });
  });

  it('drops the prompt when the connection closes', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\npm=apt-get\nuid=1000\n' });
    await session.start(profile);
    bridge.emitClosed('eof');
    expect(session.currentState).toEqual({ status: 'closed' });
  });

  it('ignores a stale probe after the connection closes', async () => {
    const { bridge, session } = createHarness();
    const controls = bridge.deferNextExec();
    await session.start(profile);
    bridge.emitClosed('eof');
    controls.resolve({ exitCode: 0, stderr: '', stdout: 'tmux=missing\npm=apt-get\nuid=1000\n' });
    await waitForEmulatorWrites();
    expect(session.currentState).toEqual({ status: 'closed' });
  });

  it('ignores a stale probe after reconnecting to another profile', async () => {
    const { bridge, session } = createHarness();
    const controls = bridge.deferNextExec();
    await session.start(profile);
    await session.start({ ...profile, host: 'other.example.com' });
    controls.resolve({ exitCode: 0, stderr: '', stdout: 'tmux=missing\npm=apt-get\nuid=1000\n' });
    await waitForEmulatorWrites();
    expect(session.currentState).toEqual({ status: 'connected' });
    expect(bridge.execCalls).toHaveLength(2);
  });

  it('probes again on reconnect', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitClosed('eof');
    await session.start(profile);
    expect(bridge.execCalls).toHaveLength(2);
  });

  it('lists every tmux session by its full name and reads them back over exec', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult({
      exitCode: 0,
      stderr: '',
      stdout: 'ts=work\nts=other01-play\nts=play\nrc=0\ncs=play\n',
    });
    const result = await session.listTmuxSessions();
    expect(result).toEqual({
      kind: 'sessions',
      currentSessionName: 'play',
      sessionNames: ['work', 'other01-play', 'play'],
    });
    expect(bridge.loginShellCalls).toEqual([tmuxCheckUtil.loginListScript]);
    expect(bridge.execCalls[1]).toBe(tmuxCheckUtil.readListScript);
  });

  it('returns an empty tmux session list while not connected', async () => {
    const { bridge, session } = createHarness();
    const result = await session.listTmuxSessions();
    expect(result).toEqual({ kind: 'sessions', currentSessionName: null, sessionNames: [] });
    expect(bridge.execCalls).toEqual([]);
    expect(bridge.loginShellCalls).toEqual([]);
  });

  it('surfaces an error when the read-back exec fails', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.queueExecResult(new Error('exec channel refused'));
    const result = await session.listTmuxSessions();
    expect(result).toEqual({ kind: 'error', message: 'Could not list tmux sessions: exec channel refused' });
  });

  it('surfaces an error with env details when the login shell tmux sees no server', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.queueExecResult({
      exitCode: 0,
      stderr: '',
      stdout: 'rc=1\ntmuxenv TMPDIR=unset TMUX_TMPDIR=/run/user/1000/tmp\n',
    });
    const result = await session.listTmuxSessions();
    expect(result).toEqual({
      kind: 'error',
      message:
        'Could not list tmux sessions: tmux in a fresh login shell sees no server (TMPDIR=unset TMUX_TMPDIR=/run/user/1000/tmp)',
    });
  });

  it('surfaces an error when the login shell closed before the listing ran', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: '' });
    const result = await session.listTmuxSessions();
    expect(result).toEqual({
      kind: 'error',
      message: 'Could not list tmux sessions: the login shell closed before the listing ran',
    });
  });
});

describe('TerminalSession.killTmuxSession', () => {
  it('kills the session in a login shell', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);

    const wasKilled = await session.killTmuxSession({ sessionName: 'work' });

    expect(wasKilled).toBe(true);
    expect(bridge.loginShellCalls).toEqual([tmuxAttachUtil.toKillSessionCommand({ sessionName: 'work' })]);
  });

  it('returns false while not connected', async () => {
    const { bridge, session } = createHarness();

    const wasKilled = await session.killTmuxSession({ sessionName: 'work' });

    expect(wasKilled).toBe(false);
    expect(bridge.loginShellCalls).toEqual([]);
  });

  it('returns false when the login shell fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.failNextLoginShell(new Error('login shell timed out'));

    const wasKilled = await session.killTmuxSession({ sessionName: 'work' });

    expect(wasKilled).toBe(false);
  });
});

describe('TerminalSession.renameTmuxSession', () => {
  it('renames the session in a login shell', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);

    const wasRenamed = await session.renameTmuxSession({ nextSessionName: 'play', sessionName: 'work' });

    expect(wasRenamed).toBe(true);
    expect(bridge.loginShellCalls).toEqual([
      tmuxAttachUtil.toRenameSessionCommand({ nextSessionName: 'play', sessionName: 'work' }),
    ]);
  });

  it('returns false while not connected', async () => {
    const { bridge, session } = createHarness();

    const wasRenamed = await session.renameTmuxSession({ nextSessionName: 'play', sessionName: 'work' });

    expect(wasRenamed).toBe(false);
    expect(bridge.loginShellCalls).toEqual([]);
  });

  it('returns false when the login shell fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.failNextLoginShell(new Error('login shell timed out'));

    const wasRenamed = await session.renameTmuxSession({ nextSessionName: 'play', sessionName: 'work' });

    expect(wasRenamed).toBe(false);
  });
});

describe('TerminalSession.createTmuxSession', () => {
  it('creates the session in a login shell', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);

    const wasCreated = await session.createTmuxSession({ sessionName: 'work', startPath: '/srv/app' });

    expect(wasCreated).toBe(true);
    expect(bridge.loginShellCalls).toEqual([
      tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'work', startPath: '/srv/app' }),
    ]);
  });

  it('returns false while not connected', async () => {
    const { bridge, session } = createHarness();

    const wasCreated = await session.createTmuxSession({ sessionName: 'work' });

    expect(wasCreated).toBe(false);
    expect(bridge.loginShellCalls).toEqual([]);
  });

  it('returns false when the login shell fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.failNextLoginShell(new Error('login shell timed out'));

    const wasCreated = await session.createTmuxSession({ sessionName: 'work' });

    expect(wasCreated).toBe(false);
  });
});

describe('TerminalSession.cloneTmuxSession', () => {
  it('creates the clone in the source session working directory', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: '/srv/app\n' });

    const wasCloned = await session.cloneTmuxSession({ nextSessionName: 'work-copy', sessionName: 'work' });

    expect(wasCloned).toBe(true);
    expect(bridge.execCalls).toContain(tmuxAttachUtil.toSessionPathScript({ sessionName: 'work' }));
    expect(bridge.loginShellCalls).toContain(
      tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'work-copy', startPath: '/srv/app' })
    );
  });

  it('creates the clone without a path when the source path cannot be read', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: '' });

    const wasCloned = await session.cloneTmuxSession({ nextSessionName: 'work-copy', sessionName: 'work' });

    expect(wasCloned).toBe(true);
    expect(bridge.loginShellCalls).toContain(
      tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'work-copy' })
    );
  });

  it('returns false while not connected', async () => {
    const { bridge, session } = createHarness();

    const wasCloned = await session.cloneTmuxSession({ nextSessionName: 'work-copy', sessionName: 'work' });

    expect(wasCloned).toBe(false);
    expect(bridge.execCalls).toEqual([]);
    expect(bridge.loginShellCalls).toEqual([]);
  });

  it('returns false when the path read fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult(new Error('exec failed'));

    const wasCloned = await session.cloneTmuxSession({ nextSessionName: 'work-copy', sessionName: 'work' });

    expect(wasCloned).toBe(false);
    expect(bridge.loginShellCalls).toEqual([]);
  });
});

describe('TerminalSession.focusTmuxSession', () => {
  it('switches the attached client without writing to the terminal', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux-focus=switched\n' });

    const wasFocused = await session.focusTmuxSession({ sessionName: 'work' });

    expect(wasFocused).toBe(true);
    expect(bridge.execCalls).toContain(tmuxAttachUtil.toFocusScript({ sessionName: 'work' }));
  });

  it('writes an attach command into the terminal when no client is attached', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    const writtenAfterStart = bridge.written.length;
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux-focus=detached\n' });

    const wasFocused = await session.focusTmuxSession({ sessionName: 'work' });

    expect(wasFocused).toBe(true);
    expect(bridge.written.slice(writtenAfterStart)).toEqual([
      `${tmuxAttachUtil.toAttachSessionCommand({ sessionName: 'work' })}\r`,
    ]);
  });

  it('returns false without writing when the focus outcome is unknown', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    const writtenAfterStart = bridge.written.length;
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: '' });

    const wasFocused = await session.focusTmuxSession({ sessionName: 'work' });

    expect(wasFocused).toBe(false);
    expect(bridge.written.slice(writtenAfterStart)).toEqual([]);
  });

  it('returns false while not connected', async () => {
    const { bridge, session } = createHarness();

    const wasFocused = await session.focusTmuxSession({ sessionName: 'work' });

    expect(wasFocused).toBe(false);
    expect(bridge.execCalls).toEqual([]);
  });

  it('returns false when the exec channel fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult(new Error('exec failed'));

    const wasFocused = await session.focusTmuxSession({ sessionName: 'work' });

    expect(wasFocused).toBe(false);
  });
});

describe('TerminalSession.detachTmuxSession', () => {
  it('detaches the attached client over the exec channel without writing to the terminal', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    const writtenAfterStart = bridge.written.length;
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux-detach=detached\n' });

    const wasDetached = await session.detachTmuxSession();

    expect(wasDetached).toBe(true);
    expect(bridge.execCalls).toContain(tmuxAttachUtil.toDetachScript());
    expect(bridge.written.slice(writtenAfterStart)).toEqual([]);
  });

  it('treats a missing client as success without writing', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    const writtenAfterStart = bridge.written.length;
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux-detach=none\n' });

    const wasDetached = await session.detachTmuxSession();

    expect(wasDetached).toBe(true);
    expect(bridge.written.slice(writtenAfterStart)).toEqual([]);
  });

  it('returns false when the detach outcome is unknown', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: '' });

    const wasDetached = await session.detachTmuxSession();

    expect(wasDetached).toBe(false);
  });

  it('returns false while not connected', async () => {
    const { bridge, session } = createHarness();

    const wasDetached = await session.detachTmuxSession();

    expect(wasDetached).toBe(false);
    expect(bridge.execCalls).toEqual([]);
  });

  it('returns false when the exec channel fails', async () => {
    const { bridge, session } = createHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux=missing\n' });
    await session.start(profile);
    bridge.queueExecResult(new Error('exec failed'));

    const wasDetached = await session.detachTmuxSession();

    expect(wasDetached).toBe(false);
  });
});

describe('TerminalSession.listRemoteDirectories', () => {
  it('returns sorted subdirectory names over the port', async () => {
    const { bridge, session } = createHarness();
    bridge.queueReadDirEntries([
      { isDirectory: false, name: 'README.md' },
      { isDirectory: true, name: 'var' },
      { isDirectory: true, name: 'home' },
    ]);
    await session.start(profile);

    await expect(session.listRemoteDirectories({ path: '/' })).resolves.toEqual(['home', 'var']);
    expect(bridge.readDirCalls).toEqual([{ path: '/' }]);
  });

  it('rejects when the terminal is not connected', async () => {
    const { session } = createHarness();

    await expect(session.listRemoteDirectories({ path: '/' })).rejects.toThrow('not connected');
  });

  it('propagates listing failures', async () => {
    const { bridge, session } = createHarness();
    bridge.queueReadDirEntries(new Error('Permission denied'));
    await session.start(profile);

    await expect(session.listRemoteDirectories({ path: '/root' })).rejects.toThrow('Permission denied');
  });
});

describe('TerminalSession.scrollRows', () => {
  it('sends arrow-key repeats scaled to the swiped rows', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitData('hello ');
    await waitForEmulatorWrites();
    bridge.written.length = 0;
    session.scrollRows({ rows: 2 });
    expect(bridge.written.join('')).toBe('\x1b[B\x1b[B');
  });

  it('sends application-mode arrows when the host switched cursor key mode', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitData('\x1b[?1h');
    await waitForEmulatorWrites();
    bridge.written.length = 0;
    session.scrollRows({ rows: -1 });
    expect(bridge.written.join('')).toBe('\x1bOA');
  });

  it('sends SGR wheel events at the cursor cell when the host tracks the mouse', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitData('hi\x1b[?1000h');
    await waitForEmulatorWrites();
    bridge.written.length = 0;
    session.scrollRows({ rows: -2 });
    expect(bridge.written.join('')).toBe('\x1b[<64;3;1M\x1b[<64;3;1M');
  });

  it('writes nothing for zero rows', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.written.length = 0;
    session.scrollRows({ rows: 0 });
    expect(bridge.written).toEqual([]);
  });
});

describe('TerminalSession.scrollRows with tmux attached', () => {
  const TMUX_PROBE_STDOUT = 'tmux=present\nuid=1000';

  const createTmuxHarness = async (): Promise<TestHarness> => {
    const harness = createHarness();
    harness.bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: TMUX_PROBE_STDOUT });
    await harness.session.start(profile);
    await waitForEmulatorWrites();
    return harness;
  };

  const settleScrollFlush = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 150);
    });
  };

  it('scrolls the tmux pane history through the exec channel instead of sending keys', async () => {
    const { bridge, session } = await createTmuxHarness();
    expect(bridge.written.join('')).toContain('attach-session');
    bridge.written.length = 0;
    bridge.execCalls.length = 0;

    session.scrollRows({ rows: -3 });
    await settleScrollFlush();

    const scrollScripts = bridge.execCalls.join('\n');
    expect(scrollScripts).toContain('copy-mode -e');
    expect(scrollScripts).toContain('-X -N 3 scroll-up');
    expect(bridge.written).toEqual([]);
  });

  it('batches consecutive swipes into one exec', async () => {
    const { bridge, session } = await createTmuxHarness();
    bridge.execCalls.length = 0;

    session.scrollRows({ rows: -1 });
    session.scrollRows({ rows: -2 });
    await settleScrollFlush();

    expect(bridge.execCalls).toHaveLength(1);
    expect(bridge.execCalls[0]).toContain('-X -N 3 scroll-up');
  });

  it('keeps sending wheel events to mouse-tracking hosts even while tmux is attached', async () => {
    const { bridge, session } = await createTmuxHarness();
    bridge.emitData('\x1b[?1000h');
    await waitForEmulatorWrites();
    bridge.written.length = 0;
    bridge.execCalls.length = 0;

    session.scrollRows({ rows: 2 });

    expect(bridge.written.join('')).toBe('\x1b[<65;1;1M\x1b[<65;1;1M');
    expect(bridge.execCalls).toEqual([]);
  });

  it('sends arrow keys again after detaching from tmux', async () => {
    const { bridge, session } = await createTmuxHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux-detach=detached' });
    await session.detachTmuxSession();
    bridge.written.length = 0;

    session.scrollRows({ rows: 1 });

    expect(bridge.written.join('')).toBe('\x1b[B');
  });

  it('enables remote scrolling while tmux is attached', async () => {
    const { session } = await createTmuxHarness();
    expect(session.isRemoteScrollEnabled).toBe(true);
  });

  it('disables remote scrolling again after detaching from tmux', async () => {
    const { bridge, session } = await createTmuxHarness();
    bridge.queueExecResult({ exitCode: 0, stderr: '', stdout: 'tmux-detach=detached' });
    await session.detachTmuxSession();
    expect(session.isRemoteScrollEnabled).toBe(false);
  });
});

describe('TerminalSession.isRemoteScrollEnabled', () => {
  it('stays off for a plain shell without mouse tracking', async () => {
    const { session } = createHarness();
    await session.start(profile);
    expect(session.isRemoteScrollEnabled).toBe(false);
  });

  it('turns on when the host tracks the mouse', async () => {
    const { bridge, session } = createHarness();
    await session.start(profile);
    bridge.emitData('\x1b[?1000h');
    await waitForEmulatorWrites();
    expect(session.isRemoteScrollEnabled).toBe(true);
  });
});
