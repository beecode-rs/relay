import { shellHistoryUtil } from '@/services/ssh/shell-history-util';

describe('shellHistoryUtil.parseDetectShell', () => {
  it('detects zsh, bash, and fish from the passwd shell path', () => {
    expect(shellHistoryUtil.parseDetectShell({ stdout: '/bin/zsh' })).toBe('zsh');
    expect(shellHistoryUtil.parseDetectShell({ stdout: '/usr/bin/bash\n' })).toBe('bash');
    expect(shellHistoryUtil.parseDetectShell({ stdout: '/usr/local/bin/fish' })).toBe('fish');
  });

  it('reports unknown for an empty or unrecognized shell', () => {
    expect(shellHistoryUtil.parseDetectShell({ stdout: '' })).toBe('unknown');
    expect(shellHistoryUtil.parseDetectShell({ stdout: '\n' })).toBe('unknown');
    expect(shellHistoryUtil.parseDetectShell({ stdout: '/bin/sh' })).toBe('unknown');
    expect(shellHistoryUtil.parseDetectShell({ stdout: '/usr/sbin/dash' })).toBe('unknown');
  });
});

describe('shellHistoryUtil.toEnableLine', () => {
  it('sends the zsh enable line space-prefixed', () => {
    const enableLine = shellHistoryUtil.toEnableLine({ shell: 'zsh' });

    expect(enableLine).toBe(' setopt HIST_IGNORE_SPACE');
  });

  it('appends ignorespace to the existing bash HISTCONTROL instead of clobbering it', () => {
    const enableLine = shellHistoryUtil.toEnableLine({ shell: 'bash' });

    expect(enableLine).toBe(' HISTCONTROL=ignorespace${HISTCONTROL:+:$HISTCONTROL}');
  });

  it('sends no enable line to fish or an unknown shell', () => {
    expect(shellHistoryUtil.toEnableLine({ shell: 'fish' })).toBeNull();
    expect(shellHistoryUtil.toEnableLine({ shell: 'unknown' })).toBeNull();
  });
});

describe('shellHistoryUtil.toHistorySafeLine', () => {
  it('space-prefixes a single typed line', () => {
    const line = shellHistoryUtil.toHistorySafeLine({ line: 'tmux attach-session' });

    expect(line).toBe(' tmux attach-session');
  });
});

describe('shellHistoryUtil.toHistorySafeLines', () => {
  it('puts the enable line first and space-prefixes every command line', () => {
    const lines = shellHistoryUtil.toHistorySafeLines({
      lines: ['PATH=… tmux list-sessions', 'echo __cmh_shell_"done"__', 'exit'],
      shell: 'zsh',
    });

    expect(lines).toEqual([
      ' setopt HIST_IGNORE_SPACE',
      ' PATH=… tmux list-sessions',
      ' echo __cmh_shell_"done"__',
      ' exit',
    ]);
  });

  it('uses the bash HISTCONTROL append as the enable line', () => {
    const lines = shellHistoryUtil.toHistorySafeLines({ lines: ['cmd'], shell: 'bash' });

    expect(lines).toEqual([' HISTCONTROL=ignorespace${HISTCONTROL:+:$HISTCONTROL}', ' cmd']);
  });

  it('omits the enable line for fish and unknown shells', () => {
    expect(shellHistoryUtil.toHistorySafeLines({ lines: ['cmd'], shell: 'fish' })).toEqual([' cmd']);
    expect(shellHistoryUtil.toHistorySafeLines({ lines: ['cmd'], shell: 'unknown' })).toEqual([' cmd']);
  });
});
