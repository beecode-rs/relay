import '@/services/terminal/xterm-navigator-shim';

import { Terminal } from '@xterm/headless';

import { createScrollbackCache, serializeTerminal } from '@/services/terminal/terminal-serializer';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import { terminalUnicodeProvider } from '@/services/terminal/terminal-unicode-provider';

export type TerminalEmulator = {
  write(data: string, onComplete?: () => void): void;
  resize(cols: number, rows: number): void;
  readonly cols: number;
  readonly rows: number;
  readonly isMouseTrackingEnabled: boolean;
  snapshotRows(): TerminalSnapshot;
  reset(): void;
};

export const createTerminalEmulator = (params: { cols: number; rows: number }): TerminalEmulator => {
  const terminal = new Terminal({
    allowProposedApi: true,
    cols: params.cols,
    rows: params.rows,
    scrollback: 1000,
  });
  // xterm measures cells with its built-in Unicode 6 widths, but tmux lays
  // out its grid with modern Unicode (utf8proc): emoji get two columns there
  // and one here, which drifts absolutely-positioned redraws and splits
  // grapheme clusters across cells.
  terminal.unicode.register(terminalUnicodeProvider);
  terminal.unicode.activeVersion = terminalUnicodeProvider.version;
  const scrollbackCache = createScrollbackCache();
  terminal.onScroll(() => {
    if (terminal.buffer.active.type === 'normal') {
      scrollbackCache.scrollEventCount += 1;
    }
  });
  return {
    write: (data, onComplete) => {
      terminal.write(data, onComplete);
    },
    resize: (cols, rows) => {
      terminal.resize(cols, rows);
    },
    get cols() {
      return terminal.cols;
    },
    get rows() {
      return terminal.rows;
    },
    get isMouseTrackingEnabled() {
      return terminal.modes.mouseTrackingMode !== 'none';
    },
    snapshotRows: () => {
      return serializeTerminal(terminal, scrollbackCache);
    },
    reset: () => {
      terminal.reset();
    },
  };
};
