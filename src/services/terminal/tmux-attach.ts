import { constant } from '@/constants/constant';

const SAFE_WORD_PATTERN = /^[A-Za-z0-9_@%+=,.:-]+$/;
const DEFAULT_SESSION_NAME_PATTERN = /^s(\d+)$/;
const FOCUS_SWITCHED_MARKER = 'tmux-focus=switched';
const FOCUS_DETACHED_MARKER = 'tmux-focus=detached';
const DETACH_DETACHED_MARKER = 'tmux-detach=detached';
const DETACH_NONE_MARKER = 'tmux-detach=none';
const SCROLL_SCROLLED_MARKER = 'tmux-scroll=scrolled';
const SCROLL_LIVE_MARKER = 'tmux-scroll=live';
const SCROLL_NONE_MARKER = 'tmux-scroll=none';

export type TmuxFocusOutcome = { kind: 'switched' } | { kind: 'detached' } | { kind: 'unknown' };
export type TmuxDetachOutcome = { kind: 'detached' } | { kind: 'none' } | { kind: 'unknown' };
export type TmuxScrollOutcome = { kind: 'scrolled' } | { kind: 'live' } | { kind: 'none' };

export const tmuxAttachUtil = {

  toCommand(params: { preferredSessionName?: string; startPath?: string }): string {
    const preferredSessionClause = tmuxAttachUtil._toPreferredSessionClause(params.preferredSessionName);
    const startDirClause = tmuxAttachUtil._toStartDirClause(params.startPath);

    return `${constant.tmux.pathPrelude} ${preferredSessionClause}tmux attach-session 2>/dev/null || tmux new-session -A -s s01${startDirClause}`;
  },

  toAttachSessionCommand(params: { sessionName: string }): string {
    const target = tmuxAttachUtil._toShellWord(params.sessionName);

    return `${constant.tmux.pathPrelude} tmux attach-session -t ${target}`;
  },

  toCreateSessionCommand(params: { sessionName: string; startPath?: string }): string {
    const target = tmuxAttachUtil._toShellWord(params.sessionName);
    const startDirClause = tmuxAttachUtil._toStartDirClause(params.startPath);

    return `${constant.tmux.pathPrelude} tmux new-session -d -s ${target}${startDirClause}`;
  },

  toFocusScript(params: { sessionName: string }): string {
    const name = tmuxAttachUtil._toShellWord(params.sessionName);

    return `relay_tmux_name=${name} ${tmuxAttachUtil._toClientScript({
      attachedCommand: `tmux switch-client -c "$relay_tmux_tty" -t "$relay_tmux_name" >/dev/null 2>&1 && echo ${FOCUS_SWITCHED_MARKER}`,
      detachedCommand: `echo ${FOCUS_DETACHED_MARKER}`,
    })}`;
  },

  toFocusOutcome(params: { stdout: string }): TmuxFocusOutcome {
    const lines = tmuxAttachUtil._toStdoutLines(params.stdout);
    if (lines.includes(FOCUS_SWITCHED_MARKER)) {
      return { kind: 'switched' };
    }
    if (lines.includes(FOCUS_DETACHED_MARKER)) {
      return { kind: 'detached' };
    }

    return { kind: 'unknown' };
  },

  toDetachScript(): string {
    return tmuxAttachUtil._toClientScript({
      attachedCommand: `tmux detach-client -t "$relay_tmux_tty" >/dev/null 2>&1 && echo ${DETACH_DETACHED_MARKER}`,
      detachedCommand: `echo ${DETACH_NONE_MARKER}`,
    });
  },

  toDetachOutcome(params: { stdout: string }): TmuxDetachOutcome {
    const lines = tmuxAttachUtil._toStdoutLines(params.stdout);
    if (lines.includes(DETACH_DETACHED_MARKER)) {
      return { kind: 'detached' };
    }
    if (lines.includes(DETACH_NONE_MARKER)) {
      return { kind: 'none' };
    }

    return { kind: 'unknown' };
  },

  toScrollScript(params: { rows: number }): string {
    const count = Math.abs(params.rows);
    const scrollCommands =
      params.rows < 0
        ? `if [ "$(tmux display-message -p -t "$relay_tmux_session" "#{pane_in_mode}" 2>/dev/null)" != "1" ]; then tmux copy-mode -e -t "$relay_tmux_session" >/dev/null 2>&1; fi; tmux send-keys -t "$relay_tmux_session" -X -N ${count} scroll-up >/dev/null 2>&1; echo ${SCROLL_SCROLLED_MARKER}`
        : `if [ "$(tmux display-message -p -t "$relay_tmux_session" "#{pane_in_mode}" 2>/dev/null)" = "1" ]; then tmux send-keys -t "$relay_tmux_session" -X -N ${count} scroll-down >/dev/null 2>&1; echo ${SCROLL_SCROLLED_MARKER}; else echo ${SCROLL_LIVE_MARKER}; fi`;

    return `sh -c '${constant.tmux.pathPrelude} relay_tmux_line=$(tmux list-clients -F "#{client_tty} #{client_session}" 2>/dev/null | tail -n 1); relay_tmux_session=$(printf "%s\\n" "$relay_tmux_line" | cut -d" " -f2); if [ -n "$relay_tmux_session" ]; then ${scrollCommands}; else echo ${SCROLL_NONE_MARKER}; fi'`;
  },

  toScrollOutcome(params: { stdout: string }): TmuxScrollOutcome {
    const lines = tmuxAttachUtil._toStdoutLines(params.stdout);
    if (lines.includes(SCROLL_SCROLLED_MARKER)) {
      return { kind: 'scrolled' };
    }
    if (lines.includes(SCROLL_LIVE_MARKER)) {
      return { kind: 'live' };
    }

    return { kind: 'none' };
  },

  toKillSessionCommand(params: { sessionName: string }): string {
    const target = tmuxAttachUtil._toShellWord(params.sessionName);

    return `${constant.tmux.pathPrelude} tmux kill-session -t ${target}`;
  },

  toRenameSessionCommand(params: { nextSessionName: string; sessionName: string }): string {
    const target = tmuxAttachUtil._toShellWord(params.sessionName);
    const nextName = tmuxAttachUtil._toShellWord(params.nextSessionName);

    return `${constant.tmux.pathPrelude} tmux rename-session -t ${target} ${nextName}`;
  },

  toNextSessionName(params: { sessionNames: string[] }): string {
    const maxNumber = params.sessionNames.reduce((accumulator, sessionName) => {
      const match = DEFAULT_SESSION_NAME_PATTERN.exec(sessionName);
      if (match === null) {
        return accumulator;
      }

      return Math.max(accumulator, Number.parseInt(match[1], 10));
    }, 0);

    return `s${String(maxNumber + 1).padStart(2, '0')}`;
  },

  // Dropped mobile connections leave zombie tmux clients behind (sshd holds the
  // PTY while the dead socket lingers), and list-clients returns them in
  // creation order - oldest first. The live client is always the newest one,
  // so client scripts must select the last one, never the first.
  _toClientScript(params: { attachedCommand: string; detachedCommand: string }): string {
    return `sh -c '${constant.tmux.pathPrelude} relay_tmux_tty=$(tmux list-clients -F "#{client_tty} #{client_session}" 2>/dev/null | tail -n 1 | cut -d" " -f1); if [ -n "$relay_tmux_tty" ]; then ${params.attachedCommand}; else ${params.detachedCommand}; fi'`;
  },

  _toStdoutLines(stdout: string): string[] {
    return stdout.split('\n').map((line) => {
      return line.replace(/\r$/, '').trim();
    });
  },

  _toPreferredSessionClause(preferredSessionName: string | undefined): string {
    const trimmedName = preferredSessionName?.trim();
    if (trimmedName === undefined || trimmedName === '') {
      return '';
    }

    return `tmux attach-session -t ${tmuxAttachUtil._toShellWord(trimmedName)} 2>/dev/null || `;
  },

  _toShellWord(value: string): string {
    if (SAFE_WORD_PATTERN.test(value)) {
      return value;
    }

    return `'${value.replaceAll("'", "'\\''")}'`;
  },

  _toStartDirClause(startPath: string | undefined): string {
    const trimmedPath = startPath?.trim();
    if (trimmedPath === undefined || trimmedPath === '') {
      return '';
    }

    return ` -c ${tmuxAttachUtil._toShellWord(trimmedPath)}`;
  },
};
