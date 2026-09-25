import { tmuxCheckUtil } from '@/services/terminal/tmux-check';
import { constant } from '@/constants/constant';

describe('tmuxCheckUtil.parse', () => {
  it('parses a present probe result', () => {
    const result = tmuxCheckUtil.parse({ stdout: 'tmux=present\npm=apt-get\nuid=1000\n' });

    expect(result).toEqual({
      packageManager: 'apt-get',
      tmuxStatus: 'present',
      uid: '1000',
    });
  });

  it('parses a missing probe result with crlf line endings', () => {
    const result = tmuxCheckUtil.parse({ stdout: 'tmux=missing\r\npm=yum\r\nuid=0\r\n' });

    expect(result).toEqual({ packageManager: 'yum', tmuxStatus: 'missing', uid: '0' });
  });

  it('ignores noise lines around the markers', () => {
    const result = tmuxCheckUtil.parse({
      stdout: 'Welcome to Ubuntu 22.04\n tmux=missing \nLast login: today\npm=apk\nuid=1001\n',
    });

    expect(result).toEqual({ packageManager: 'apk', tmuxStatus: 'missing', uid: '1001' });
  });

  it('returns unknown for empty or unparseable stdout', () => {
    expect(tmuxCheckUtil.parse({ stdout: '' })).toEqual({
      packageManager: 'unknown',
      tmuxStatus: 'unknown',
      uid: 'unknown',
    });
    expect(tmuxCheckUtil.parse({ stdout: 'This account is restricted\n' })).toEqual({
      packageManager: 'unknown',
      tmuxStatus: 'unknown',
      uid: 'unknown',
    });
  });

  it('rejects unknown package managers and non numeric uid values', () => {
    const result = tmuxCheckUtil.parse({ stdout: 'tmux=missing\npm=nonsense\nuid=abc\n' });

    expect(result).toEqual({
      packageManager: 'unknown',
      tmuxStatus: 'missing',
      uid: 'unknown',
    });
  });
});

describe('tmuxCheckUtil.parseListOutcome', () => {
  it('lists every tmux session by its full name when the listing succeeded', () => {
    const outcome = tmuxCheckUtil.parseListOutcome({
      stdout: 'ts=work\r\nts=other01-play\nts=side\nrc=0\ntmuxenv TMPDIR=unset TMUX_TMPDIR=unset\ncs=work\n',
    });

    expect(outcome).toEqual({
      kind: 'listed',
      currentSessionName: 'work',
      sessionNames: ['work', 'other01-play', 'side'],
    });
  });

  it('reports the newest client session as the current session', () => {
    const outcome = tmuxCheckUtil.parseListOutcome({
      stdout: 'rc=0\ncs=side\ncs=work\n',
    });

    expect(outcome).toEqual({ kind: 'listed', currentSessionName: 'work', sessionNames: [] });
  });

  it('reports a null current session when no client is attached', () => {
    const outcome = tmuxCheckUtil.parseListOutcome({
      stdout: 'ts=work\nrc=0\n',
    });

    expect(outcome).toEqual({ kind: 'listed', currentSessionName: null, sessionNames: ['work'] });
  });

  it('reports no-server with the login shell env details when tmux failed', () => {
    const outcome = tmuxCheckUtil.parseListOutcome({
      stdout: 'rc=1\ntmuxenv TMPDIR=/tmp TMUX_TMPDIR=/run/user/1000/tmp\n',
    });

    expect(outcome).toEqual({ kind: 'no-server', envDetails: 'TMPDIR=/tmp TMUX_TMPDIR=/run/user/1000/tmp' });
  });

  it('reports not-run when the outcome file has no rc marker', () => {
    expect(tmuxCheckUtil.parseListOutcome({ stdout: '' })).toEqual({ kind: 'not-run' });
    expect(tmuxCheckUtil.parseListOutcome({ stdout: 'ts=work\n' })).toEqual({ kind: 'not-run' });
  });
});

describe('tmuxCheckUtil.loginListScript', () => {
  it('writes the listing, client sessions, an rc marker and env details to a private file', () => {
    expect(tmuxCheckUtil.loginListScript).toBe(
      constant.tmux.pathPrelude +
        ' umask 077; { tmux list-sessions -F "ts=#S"; echo "rc=$?"; echo "tmuxenv TMPDIR=${TMPDIR:-unset} TMUX_TMPDIR=${TMUX_TMPDIR:-unset}"; tmux list-clients -F "cs=#{client_session}"; } > "$HOME/.cmh-tmux-sessions" 2>/dev/null'
    );
  });
});

describe('tmuxCheckUtil.readListScript', () => {
  it('reads the login shell listing tolerating a missing file', () => {
    expect(tmuxCheckUtil.readListScript).toBe('cat "$HOME/.cmh-tmux-sessions" 2>/dev/null || true');
  });
});

describe('tmuxCheckUtil.toInstallCommand', () => {
  it('updates package lists before installing with apt-get and sudo', () => {
    const command = tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'apt-get' });

    expect(command).toBe('sudo apt-get update && sudo apt-get install -y tmux');
  });

  it('omits sudo for root', () => {
    const command = tmuxCheckUtil.toInstallCommand({ isRoot: true, packageManager: 'apt-get' });

    expect(command).toBe('apt-get update && apt-get install -y tmux');
  });

  it('maps the remaining package managers with sudo', () => {
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'apk' })).toBe('sudo apk add tmux');
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'dnf' })).toBe('sudo dnf install -y tmux');
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'pacman' })).toBe(
      'sudo pacman -Sy --noconfirm tmux'
    );
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'pkg' })).toBe('sudo pkg install -y tmux');
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'yum' })).toBe('sudo yum install -y tmux');
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'zypper' })).toBe(
      'sudo zypper --non-interactive install tmux'
    );
  });

  it('never prefixes brew with sudo', () => {
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'brew' })).toBe('brew install tmux');
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: true, packageManager: 'brew' })).toBe('brew install tmux');
  });

  it('returns null for an unknown package manager', () => {
    expect(tmuxCheckUtil.toInstallCommand({ isRoot: false, packageManager: 'unknown' })).toBeNull();
  });
});

describe('tmuxCheckUtil.probeScript', () => {
  it('wraps the probe in a posix shell without inner single quotes', () => {
    expect(tmuxCheckUtil.probeScript.startsWith("sh -c '")).toBe(true);
    expect(tmuxCheckUtil.probeScript.endsWith("'")).toBe(true);

    const innerScript = tmuxCheckUtil.probeScript.slice("sh -c '".length, -1);
    expect(innerScript.includes("'")).toBe(false);
  });

  it('does not list sessions because the exec channel can be blind to the login shell tmux server', () => {
    const innerScript = tmuxCheckUtil.probeScript.slice("sh -c '".length, -1);

    expect(innerScript.includes('list-sessions')).toBe(false);
  });

  it('extends the PATH with common non-login shell binary directories before probing', () => {
    const innerScript = tmuxCheckUtil.probeScript.slice("sh -c '".length, -1);

    expect(innerScript.startsWith(constant.tmux.pathPrelude)).toBe(true);
  });
});
