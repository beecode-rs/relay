import { constant } from '@/constants/constant';

const PACKAGE_MANAGERS = ['apt-get', 'dnf', 'yum', 'apk', 'pacman', 'zypper', 'brew', 'pkg'] as const;
const CS_PREFIX_LENGTH = 'cs='.length;
const PM_PREFIX_LENGTH = 'pm='.length;
const TMUXENV_PREFIX_LENGTH = 'tmuxenv '.length;
const TS_PREFIX_LENGTH = 'ts='.length;
const UID_PREFIX_LENGTH = 'uid='.length;

export type TmuxPackageManager = (typeof PACKAGE_MANAGERS)[number];
export type TmuxProbeStatus = 'missing' | 'present' | 'unknown';

export type TmuxProbeResult = {
  packageManager: TmuxPackageManager | 'unknown';
  tmuxStatus: TmuxProbeStatus;
  uid: string;
};

export type TmuxListOutcome =
  | { kind: 'listed'; currentSessionName: string | null; sessionNames: string[] }
  | { kind: 'no-server'; envDetails: string }
  | { kind: 'not-run' };

export const tmuxCheckUtil = {
  probeScript:
    `sh -c '${constant.tmux.pathPrelude} command -v tmux >/dev/null 2>&1 && echo tmux=present || echo tmux=missing; for pm in apt-get dnf yum apk pacman zypper brew pkg; do if command -v $pm >/dev/null 2>&1; then echo pm=$pm; break; fi; done; echo uid=$(id -u 2>/dev/null || echo unknown)'`,

  loginListScript:
    constant.tmux.pathPrelude +
    ' umask 077; { tmux list-sessions -F "ts=#S"; echo "rc=$?"; echo "tmuxenv TMPDIR=${TMPDIR:-unset} TMUX_TMPDIR=${TMUX_TMPDIR:-unset}"; tmux list-clients -F "cs=#{client_session}"; } > "$HOME/.cmh-tmux-sessions" 2>/dev/null',

  readListScript: 'cat "$HOME/.cmh-tmux-sessions" 2>/dev/null || true',

  parse(params: { stdout: string }): TmuxProbeResult {
    const lines = tmuxCheckUtil._toLines(params.stdout);

    return {
      packageManager: tmuxCheckUtil._packageManagerOf(lines),
      tmuxStatus: tmuxCheckUtil._tmuxStatusOf(lines),
      uid: tmuxCheckUtil._uidOf(lines),
    };
  },

  parseListOutcome(params: { stdout: string }): TmuxListOutcome {
    return tmuxCheckUtil._listOutcomeOf({
      lines: tmuxCheckUtil._toLines(params.stdout),
    });
  },

  _toLines(stdout: string): string[] {
    return stdout.split('\n').map((line) => {
      return line.replace(/\r$/, '').trim();
    });
  },

  toInstallCommand(params: { isRoot: boolean; packageManager: TmuxPackageManager | 'unknown' }): string | null {
    if (params.packageManager === 'unknown') {
      return null;
    }
    const segments = tmuxCheckUtil._toCommandSegments({ packageManager: params.packageManager });
    const isSudoNeeded = !params.isRoot && params.packageManager !== 'brew';

    return segments
      .map((segment) => {
        if (!isSudoNeeded) {
          return segment;
        }

        return `sudo ${segment}`;
      })
      .join(' && ');
  },

  _listOutcomeOf(params: { lines: string[] }): TmuxListOutcome {
    const rcLine = params.lines.find((line) => {
      return line.startsWith('rc=');
    });
    if (rcLine === undefined) {
      return { kind: 'not-run' };
    }
    if (rcLine !== 'rc=0') {
      return { kind: 'no-server', envDetails: tmuxCheckUtil._envDetailsOf(params.lines) };
    }

    return {
      kind: 'listed',
      currentSessionName: tmuxCheckUtil._currentSessionNameOf(params.lines),
      sessionNames: tmuxCheckUtil._sessionNamesOf(params.lines),
    };
  },

  _envDetailsOf(lines: string[]): string {
    const matched = lines.find((line) => {
      return line.startsWith('tmuxenv ');
    });
    if (matched === undefined) {
      return '';
    }

    return matched.slice(TMUXENV_PREFIX_LENGTH);
  },

  _packageManagerOf(lines: string[]): TmuxPackageManager | 'unknown' {
    const candidates = lines
      .filter((line) => {
        return line.startsWith('pm=');
      })
      .map((line) => {
        return line.slice(PM_PREFIX_LENGTH);
      });
    const matched = PACKAGE_MANAGERS.find((packageManager) => {
      return candidates.includes(packageManager);
    });
    if (matched === undefined) {
      return 'unknown';
    }

    return matched;
  },

  _currentSessionNameOf(lines: string[]): string | null {
    const clientSessions = lines
      .filter((line) => {
        return line.startsWith('cs=');
      })
      .map((line) => {
        return line.slice(CS_PREFIX_LENGTH);
      });
    const lastClientSession = clientSessions[clientSessions.length - 1];
    if (lastClientSession === undefined || lastClientSession === '') {
      return null;
    }

    return lastClientSession;
  },

  _sessionNamesOf(lines: string[]): string[] {
    return lines
      .filter((line) => {
        return line.startsWith('ts=');
      })
      .map((line) => {
        return line.slice(TS_PREFIX_LENGTH);
      })
      .filter((sessionName) => {
        return sessionName !== '';
      });
  },

  _tmuxStatusOf(lines: string[]): TmuxProbeStatus {
    if (lines.includes('tmux=present')) {
      return 'present';
    }
    if (lines.includes('tmux=missing')) {
      return 'missing';
    }

    return 'unknown';
  },

  _uidOf(lines: string[]): string {
    const matched = lines.find((line) => {
      return /^uid=\d+$/.test(line);
    });
    if (matched === undefined) {
      return 'unknown';
    }

    return matched.slice(UID_PREFIX_LENGTH);
  },

  _toCommandSegments(params: { packageManager: TmuxPackageManager }): string[] {
    switch (params.packageManager) {
      case 'apk': {
        return ['apk add tmux'];
      }
      case 'apt-get': {
        return ['apt-get update', 'apt-get install -y tmux'];
      }
      case 'brew': {
        return ['brew install tmux'];
      }
      case 'dnf': {
        return ['dnf install -y tmux'];
      }
      case 'pacman': {
        return ['pacman -Sy --noconfirm tmux'];
      }
      case 'pkg': {
        return ['pkg install -y tmux'];
      }
      case 'yum': {
        return ['yum install -y tmux'];
      }
      case 'zypper': {
        return ['zypper --non-interactive install tmux'];
      }
      default: {
        throw new Error(`Unsupported package manager: ${String(params.packageManager)}`);
      }
    }
  },
};
