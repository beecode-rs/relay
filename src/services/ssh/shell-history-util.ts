const KNOWN_SHELL_BASE_NAMES = ['bash', 'fish', 'zsh'] as const;

export type DetectedShellKind = (typeof KNOWN_SHELL_BASE_NAMES)[number] | 'unknown';

export const shellHistoryUtil = {
  // Exec-channel probe, so it is never typed into an interactive shell and
  // cannot land in history. sh -c shields it from rc files, and $SHELL there
  // is the passwd shell - the same shell client.shell() opens.
  detectScript: `sh -c 'printf %s "$SHELL"'`,

  parseDetectShell(params: { stdout: string }): DetectedShellKind {
    const { stdout } = params;
    const shellPath = stdout.split('\n')[0]?.trim() ?? '';
    const baseName = shellPath.split('/').pop() ?? '';
    const matched = KNOWN_SHELL_BASE_NAMES.find((shellName) => {
      return shellName === baseName;
    });
    if (matched === undefined) {
      return 'unknown';
    }

    return matched;
  },

  toEnableLine(params: { shell: DetectedShellKind }): string | null {
    switch (params.shell) {
      case 'bash': {
        return ' HISTCONTROL=ignorespace${HISTCONTROL:+:$HISTCONTROL}';
      }
      case 'zsh': {
        return ' setopt HIST_IGNORE_SPACE';
      }
      default: {
        // fish skips space-prefixed commands by default, and an unknown shell
        // must not receive syntax we have not verified.
        return null;
      }
    }
  },

  toHistorySafeLine(params: { line: string }): string {
    const { line } = params;

    return ` ${line}`;
  },

  // A shell decides whether to record a line the moment it accepts it, so the
  // enable line must be typed first, as its own line - an inline
  // `setopt ...; command` would not protect that line. The enable line itself
  // is recorded once per fresh shell session, the mechanism's one unavoidable
  // history trace; every line after it is skipped.
  toHistorySafeLines(params: { lines: string[]; shell: DetectedShellKind }): string[] {
    const { lines, shell } = params;
    const enableLine = shellHistoryUtil.toEnableLine({ shell });
    const prefixedLines = lines.map((line) => {
      return ` ${line}`;
    });
    if (enableLine === null) {
      return prefixedLines;
    }

    return [enableLine, ...prefixedLines];
  },
};
