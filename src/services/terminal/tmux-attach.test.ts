import { tmuxAttachUtil } from '@/services/terminal/tmux-attach';
import { constant } from '@/constants/constant';

describe('tmuxAttachUtil.toDetachScript', () => {
  it('detaches the newest tmux client', () => {
    const script = tmuxAttachUtil.toDetachScript();

    expect(script).toContain('tmux list-clients -F "#{client_tty} #{client_session}"');
    expect(script).toContain('tail -n 1');
    expect(script).toContain('tmux detach-client -t "$relay_tmux_tty"');
  });

  it('echoes distinct markers for the detached and no-client outcomes', () => {
    const script = tmuxAttachUtil.toDetachScript();

    expect(script).toContain('echo tmux-detach=detached');
    expect(script).toContain('echo tmux-detach=none');
  });

  it('resolves tmux through the shared PATH prelude so a user-installed tmux wins', () => {
    const script = tmuxAttachUtil.toDetachScript();

    expect(script).toContain(`sh -c '${constant.tmux.pathPrelude} relay_tmux_tty=`);
  });
});

describe('tmuxAttachUtil.toDetachOutcome', () => {
  it('reads the detached marker from stdout', () => {
    const outcome = tmuxAttachUtil.toDetachOutcome({ stdout: 'tmux-detach=detached\n' });

    expect(outcome).toEqual({ kind: 'detached' });
  });

  it('reads the no-client marker from stdout', () => {
    const outcome = tmuxAttachUtil.toDetachOutcome({ stdout: 'tmux-detach=none\r\n' });

    expect(outcome).toEqual({ kind: 'none' });
  });

  it('reports unknown when no marker is printed', () => {
    const outcome = tmuxAttachUtil.toDetachOutcome({ stdout: '' });

    expect(outcome).toEqual({ kind: 'unknown' });
  });
});

describe('tmuxAttachUtil.toCommand', () => {
  it('attaches to the last used session and creates one only when none exists', () => {
    const command = tmuxAttachUtil.toCommand({});

    expect(command).toBe(
      `${constant.tmux.pathPrelude} tmux attach-session 2>/dev/null || tmux new-session -A -s s01`
    );
  });

  it('resolves tmux through the shared PATH prelude so the running server builds the client', () => {
    const command = tmuxAttachUtil.toCommand({});

    expect(command.startsWith(constant.tmux.pathPrelude)).toBe(true);
    expect(command).toContain('tmux attach-session');
  });

  it('creates s01 with attach fallback so a duplicate name cannot fail', () => {
    const command = tmuxAttachUtil.toCommand({});

    expect(command).toContain('tmux new-session -A -s s01');
  });

  it('starts the created session in the given start path', () => {
    const command = tmuxAttachUtil.toCommand({ startPath: '/srv/app' });

    expect(command).toContain("tmux new-session -A -s s01 -c '/srv/app'");
  });

  it('omits the start directory for an empty start path', () => {
    const command = tmuxAttachUtil.toCommand({ startPath: '   ' });

    expect(command).not.toContain(' -c ');
  });

  it('tries the remembered session first and falls back to the last used session', () => {
    const command = tmuxAttachUtil.toCommand({ preferredSessionName: 'work' });

    expect(command).toBe(
      `${constant.tmux.pathPrelude} tmux attach-session -t work 2>/dev/null || tmux attach-session 2>/dev/null || tmux new-session -A -s s01`
    );
  });

  it('falls back to the last used session when the remembered session is gone', () => {
    const command = tmuxAttachUtil.toCommand({ preferredSessionName: 'work' });

    expect(command).toContain('tmux attach-session -t work 2>/dev/null || tmux attach-session 2>/dev/null');
  });

  it('shell quotes an unsafe remembered session name', () => {
    const command = tmuxAttachUtil.toCommand({ preferredSessionName: "my session's" });

    expect(command).toContain("tmux attach-session -t 'my session'\\''s' 2>/dev/null");
  });

  it('ignores a blank remembered session name', () => {
    const command = tmuxAttachUtil.toCommand({ preferredSessionName: '   ' });

    expect(command).not.toContain('attach-session -t ');
  });
});

describe('tmuxAttachUtil.toAttachSessionCommand', () => {
  it('attaches to the named session', () => {
    const command = tmuxAttachUtil.toAttachSessionCommand({ sessionName: 'work' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux attach-session -t work`);
  });

  it('single quotes session names with shell unsafe characters', () => {
    const command = tmuxAttachUtil.toAttachSessionCommand({ sessionName: 'my session' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux attach-session -t 'my session'`);
  });
});

describe('tmuxAttachUtil.toCreateSessionCommand', () => {
  it('creates the session detached', () => {
    const command = tmuxAttachUtil.toCreateSessionCommand({ sessionName: 's02' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux new-session -d -s s02`);
  });

  it('single quotes session names with shell unsafe characters', () => {
    const command = tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'my session' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux new-session -d -s 'my session'`);
  });

  it('starts the session in the given start path', () => {
    const command = tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'work', startPath: '/home/user' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux new-session -d -s work -c '/home/user'`);
  });

  it('single quotes start paths containing spaces', () => {
    const command = tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'work', startPath: '/opt/my app' });

    expect(command).toContain("-c '/opt/my app'");
  });

  it('omits the start directory without a start path', () => {
    const command = tmuxAttachUtil.toCreateSessionCommand({ sessionName: 'work' });

    expect(command).not.toContain(' -c ');
  });
});

describe('tmuxAttachUtil.toFocusScript', () => {
  it('switches the newest tmux client to the named session', () => {
    const script = tmuxAttachUtil.toFocusScript({ sessionName: 'work' });

    expect(script).toContain('relay_tmux_name=work');
    expect(script).toContain('tmux list-clients -F "#{client_tty} #{client_session}"');
    expect(script).toContain('tail -n 1');
    expect(script).toContain('tmux switch-client -c "$relay_tmux_tty" -t "$relay_tmux_name"');
  });

  it('echoes distinct markers for the switched and detached outcomes', () => {
    const script = tmuxAttachUtil.toFocusScript({ sessionName: 'work' });

    expect(script).toContain('echo tmux-focus=switched');
    expect(script).toContain('echo tmux-focus=detached');
  });

  it('shell quotes an unsafe session name as an environment assignment', () => {
    const script = tmuxAttachUtil.toFocusScript({ sessionName: 'my session' });

    expect(script).toContain("relay_tmux_name='my session'");
  });

  it('resolves tmux through the shared PATH prelude so a user-installed tmux wins', () => {
    const script = tmuxAttachUtil.toFocusScript({ sessionName: 'work' });

    expect(script).toContain(`sh -c '${constant.tmux.pathPrelude} relay_tmux_tty=`);
  });
});

describe('tmuxAttachUtil.toFocusOutcome', () => {
  it('reads the switched marker from stdout', () => {
    const outcome = tmuxAttachUtil.toFocusOutcome({ stdout: 'tmux-focus=switched\n' });

    expect(outcome).toEqual({ kind: 'switched' });
  });

  it('reads the detached marker from stdout', () => {
    const outcome = tmuxAttachUtil.toFocusOutcome({ stdout: 'tmux-focus=detached\r\n' });

    expect(outcome).toEqual({ kind: 'detached' });
  });

  it('reports unknown when no marker is printed', () => {
    const outcome = tmuxAttachUtil.toFocusOutcome({ stdout: '' });

    expect(outcome).toEqual({ kind: 'unknown' });
  });
});

describe('tmuxAttachUtil.toKillSessionCommand', () => {
  it('kills the named session by target', () => {
    const command = tmuxAttachUtil.toKillSessionCommand({ sessionName: 'work' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux kill-session -t work`);
  });

  it('single quotes session names with shell unsafe characters', () => {
    const command = tmuxAttachUtil.toKillSessionCommand({ sessionName: 'my session' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux kill-session -t 'my session'`);
  });
});

describe('tmuxAttachUtil.toRenameSessionCommand', () => {
  it('renames the session by target', () => {
    const command = tmuxAttachUtil.toRenameSessionCommand({ nextSessionName: 'play', sessionName: 'work' });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux rename-session -t work play`);
  });

  it('single quotes session names with shell unsafe characters', () => {
    const command = tmuxAttachUtil.toRenameSessionCommand({
      nextSessionName: 'my session',
      sessionName: "bob's",
    });

    expect(command).toBe(`${constant.tmux.pathPrelude} tmux rename-session -t 'bob'\\''s' 'my session'`);
  });
});

describe('tmuxAttachUtil.toNextSessionName', () => {
  it('starts at s01 when no sessions exist', () => {
    const sessionName = tmuxAttachUtil.toNextSessionName({ sessionNames: [] });

    expect(sessionName).toBe('s01');
  });

  it('continues after the highest default-numbered session', () => {
    const sessionName = tmuxAttachUtil.toNextSessionName({ sessionNames: ['s01', 's02'] });

    expect(sessionName).toBe('s03');
  });

  it('ignores custom names and gaps in the numbering', () => {
    const sessionName = tmuxAttachUtil.toNextSessionName({ sessionNames: ['work', 's01', 's04'] });

    expect(sessionName).toBe('s05');
  });
});

describe('tmuxAttachUtil.toScrollScript', () => {
  it('builds a scroll-up script that enters copy mode with exit-at-bottom and scrolls N lines', () => {
    const script = tmuxAttachUtil.toScrollScript({ rows: -3 });

    expect(script).toContain('tmux list-clients -F "#{client_tty} #{client_session}"');
    expect(script).toContain('tail -n 1');
    expect(script).toContain('cut -d" " -f2');
    expect(script).toContain("tmux copy-mode -e -t \"$relay_tmux_session\"");
    expect(script).toContain("tmux send-keys -t \"$relay_tmux_session\" -X -N 3 scroll-up");
    expect(script).toContain('echo tmux-scroll=scrolled');
  });

  it('builds a scroll-down script that only scrolls while the pane is in copy mode', () => {
    const script = tmuxAttachUtil.toScrollScript({ rows: 2 });

    expect(script).not.toContain('copy-mode');
    expect(script).toContain("tmux send-keys -t \"$relay_tmux_session\" -X -N 2 scroll-down");
    expect(script).toContain('echo tmux-scroll=live');
  });

  it.each([-3, 2])('keeps the sh -c body free of single quotes that would end it early (rows %i)', (rows) => {
    const script = tmuxAttachUtil.toScrollScript({ rows });
    const body = script.slice(script.indexOf("sh -c '") + "sh -c '".length, -1);

    expect(script.endsWith("'")).toBe(true);
    expect(body).not.toContain("'");
  });

  it('resolves tmux through the shared PATH prelude so a user-installed tmux wins', () => {
    const script = tmuxAttachUtil.toScrollScript({ rows: -1 });

    expect(script).toContain(`sh -c '${constant.tmux.pathPrelude} relay_tmux_line=`);
  });

  it('echoes the no-client marker when no client is attached', () => {
    const script = tmuxAttachUtil.toScrollScript({ rows: -1 });

    expect(script).toContain('echo tmux-scroll=none');
  });
});

describe('tmuxAttachUtil.toScrollOutcome', () => {
  it('maps the scrolled, live, and missing markers', () => {
    expect(tmuxAttachUtil.toScrollOutcome({ stdout: 'tmux-scroll=scrolled' })).toEqual({ kind: 'scrolled' });
    expect(tmuxAttachUtil.toScrollOutcome({ stdout: 'tmux-scroll=live' })).toEqual({ kind: 'live' });
    expect(tmuxAttachUtil.toScrollOutcome({ stdout: '' })).toEqual({ kind: 'none' });
  });
});

describe('tmuxAttachUtil.toSessionPathScript', () => {
  it('reads the working directory of the target session pane', () => {
    const script = tmuxAttachUtil.toSessionPathScript({ sessionName: 'work' });

    expect(script).toBe(
      `${constant.tmux.pathPrelude} tmux display-message -p -t work '#{pane_current_path}'`
    );
  });

  it('quotes session names that are not shell-safe', () => {
    const script = tmuxAttachUtil.toSessionPathScript({ sessionName: 'my session' });

    expect(script).toContain(`-t 'my session' '#{pane_current_path}'`);
  });
});

describe('tmuxAttachUtil.toSessionPathOf', () => {
  it('trims the first stdout line', () => {
    expect(tmuxAttachUtil.toSessionPathOf({ stdout: '/srv/app\r\n' })).toBe('/srv/app');
  });

  it('skips leading empty lines', () => {
    expect(tmuxAttachUtil.toSessionPathOf({ stdout: '\n/srv/app\n' })).toBe('/srv/app');
  });

  it('returns null without any output', () => {
    expect(tmuxAttachUtil.toSessionPathOf({ stdout: '' })).toBeNull();
    expect(tmuxAttachUtil.toSessionPathOf({ stdout: '\n \n' })).toBeNull();
  });
});

describe('tmuxAttachUtil.toCloneSessionName', () => {
  it('appends -copy to the source name', () => {
    expect(tmuxAttachUtil.toCloneSessionName({ sessionName: 'work', sessionNames: [] })).toBe('work-copy');
  });

  it('numbers further duplicates', () => {
    expect(
      tmuxAttachUtil.toCloneSessionName({ sessionName: 'work', sessionNames: ['work-copy'] })
    ).toBe('work-copy-2');
    expect(
      tmuxAttachUtil.toCloneSessionName({ sessionName: 'work', sessionNames: ['work-copy', 'work-copy-2'] })
    ).toBe('work-copy-3');
  });

  it('ignores unrelated session names', () => {
    expect(tmuxAttachUtil.toCloneSessionName({ sessionName: 'work', sessionNames: ['other-copy'] })).toBe(
      'work-copy'
    );
  });
});
