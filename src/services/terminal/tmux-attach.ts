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
const CAPTURE_MARKER_PREFIX = 'tmux-capture=';
const CAPTURE_GEOMETRY_PATTERN = /^(\d+) (\d+) (\d+) (\d+)(?: (\d+))?$/;

// One capture-pane run for the newest client's active pane: `lines` starts
// `historyRowCount` rows above the live pane top and ends at its bottom row;
// `scrollPosition` is how far copy-mode has scrolled the visible window up.
export type TmuxPaneCapture = {
  historyRowCount: number;
  lines: string[];
  paneHeight: number;
  paneLeft: number;
  paneTop: number;
  paneWidth: number;
  scrollPosition: number;
};

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

  toCreateSessionScript(params: { sessionName: string; startPath?: string }): string {
    const target = tmuxAttachUtil._toShellWordForShC(params.sessionName);
    const startDirClause = tmuxAttachUtil._toStartDirClauseForShC(params.startPath);

    return tmuxAttachUtil._toExecScript(`tmux new-session -d -s ${target}${startDirClause}`);
  },

  toFocusScript(params: { sessionName: string }): string {
    const name = tmuxAttachUtil._toShellWordForShC(params.sessionName);

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

  // Captures the newest client's active pane with its SGR codes (-e), from
  // `historyRows` above the copy-mode window down to the live bottom row. The
  // geometry line comes first so the parser can place the window; an empty
  // scroll_position means the pane is not in copy-mode.
  toCaptureScript(params: { historyRows: number }): string {
    const historyRows = Math.max(0, Math.floor(params.historyRows));
    const captureCommands = `relay_tmux_geometry=$(tmux display-message -p -t "$relay_tmux_session" "#{pane_id} #{pane_top} #{pane_left} #{pane_width} #{pane_height} #{scroll_position}" 2>/dev/null); set -- $relay_tmux_geometry; if [ -n "$5" ]; then echo ${CAPTURE_MARKER_PREFIX}$2 $3 $4 $5 $6; tmux capture-pane -p -e -t "$1" -S -$((\${6:-0} + ${historyRows})) 2>/dev/null; fi`;

    return `sh -c '${constant.tmux.pathPrelude} relay_tmux_line=$(tmux list-clients -F "#{client_tty} #{client_session}" 2>/dev/null | tail -n 1); relay_tmux_session=$(printf "%s\\n" "$relay_tmux_line" | cut -d" " -f2); if [ -n "$relay_tmux_session" ]; then ${captureCommands}; fi'`;
  },

  toCaptureOutcome(params: { stdout: string }): TmuxPaneCapture | null {
    const outputLines = params.stdout.split('\n');
    const markerIndex = outputLines.findIndex((line) => {
      return line.startsWith(CAPTURE_MARKER_PREFIX);
    });
    if (markerIndex === -1) {
      return null;
    }
    const geometry = CAPTURE_GEOMETRY_PATTERN.exec(
      outputLines[markerIndex].slice(CAPTURE_MARKER_PREFIX.length).trim()
    );
    if (geometry === null) {
      return null;
    }
    const [paneTop, paneLeft, paneWidth, paneHeight] = geometry.slice(1, 5).map((value) => {
      return Number.parseInt(value, 10);
    });
    const scrollPosition = geometry[5] === undefined ? 0 : Number.parseInt(geometry[5], 10);
    // capture-pane ends every row with a newline, so the split leaves one
    // empty trailing entry behind the last row.
    const capturedLines = outputLines.slice(markerIndex + 1);
    const lines =
      capturedLines.length > 0 && capturedLines[capturedLines.length - 1] === ''
        ? capturedLines.slice(0, -1)
        : capturedLines;
    if (paneWidth <= 0 || paneHeight <= 0 || lines.length < paneHeight) {
      return null;
    }

    return {
      historyRowCount: lines.length - paneHeight,
      lines,
      paneHeight,
      paneLeft,
      paneTop,
      paneWidth,
      scrollPosition,
    };
  },

  toKillSessionScript(params: { sessionName: string }): string {
    const target = tmuxAttachUtil._toShellWordForShC(params.sessionName);

    return tmuxAttachUtil._toExecScript(`tmux kill-session -t ${target}`);
  },

  toRenameSessionScript(params: { nextSessionName: string; sessionName: string }): string {
    const target = tmuxAttachUtil._toShellWordForShC(params.sessionName);
    const nextName = tmuxAttachUtil._toShellWordForShC(params.nextSessionName);

    return tmuxAttachUtil._toExecScript(`tmux rename-session -t ${target} ${nextName}`);
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

  // tmux has no native clone; a clone is a new session started in the source
  // session's working directory, which this script reads from its active pane.
  toSessionPathScript(params: { sessionName: string }): string {
    const target = tmuxAttachUtil._toShellWord(params.sessionName);

    return `${constant.tmux.pathPrelude} tmux display-message -p -t ${target} '#{pane_current_path}'`;
  },

  toSessionPathOf(params: { stdout: string }): string | null {
    const firstLine = tmuxAttachUtil._toStdoutLines(params.stdout).find((line) => {
      return line !== '';
    });

    return firstLine ?? null;
  },

  toCloneSessionName(params: { sessionName: string; sessionNames: string[] }): string {
    const baseName = `${params.sessionName}-copy`;
    let candidateName = baseName;
    let copyIndex = 2;
    while (params.sessionNames.includes(candidateName)) {
      candidateName = `${baseName}-${String(copyIndex)}`;
      copyIndex += 1;
    }

    return candidateName;
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

  // _toShellWord may emit single quotes, which would end the sh -c '...'
  // wrapper early; re-close, escape, and reopen them so the inner shell still
  // sees the quoted word after the outer shell strips the wrapper quotes.
  _toShellWordForShC(value: string): string {
    return tmuxAttachUtil._toShellWord(value).replaceAll("'", "'\\''");
  },

  _toStartDirClause(startPath: string | undefined): string {
    const trimmedPath = startPath?.trim();
    if (trimmedPath === undefined || trimmedPath === '') {
      return '';
    }

    return ` -c ${tmuxAttachUtil._toShellWord(trimmedPath)}`;
  },

  _toStartDirClauseForShC(startPath: string | undefined): string {
    const trimmedPath = startPath?.trim();
    if (trimmedPath === undefined || trimmedPath === '') {
      return '';
    }

    return ` -c ${tmuxAttachUtil._toShellWordForShC(trimmedPath)}`;
  },

  _toExecScript(body: string): string {
    return `sh -c '${constant.tmux.pathPrelude} ${body}'`;
  },
};
