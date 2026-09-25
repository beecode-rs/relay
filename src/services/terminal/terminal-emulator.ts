import '@/services/terminal/xterm-navigator-shim';

import { Terminal } from '@xterm/headless';

import { createScrollbackCache, serializeTerminal } from '@/services/terminal/terminal-serializer';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';

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
