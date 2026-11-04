import type { TerminalEmulatorFactory } from '@/services/terminal/terminal-emulator';
import type { StyledRow, TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import type { TmuxPaneCapture } from '@/services/terminal/tmux-attach';

// A frozen, scrollable copy of a tmux pane and its history. Live screen row r
// shows document line `screenTopLine + r`; live column c is document column
// `c - colOffset`. Padding rows keep that mapping exact around the pane (the
// status line, copy-mode windows near the history top).
export type TmuxPaneDocument = {
  colOffset: number;
  screenTopLine: number;
  snapshot: TerminalSnapshot;
};

const EMPTY_ROW: StyledRow = { segments: [] };

const emptyRows = (count: number): StyledRow[] => {
  return Array.from({ length: Math.max(0, count) }, () => {
    return EMPTY_ROW;
  });
};

// The scratch emulator gets one row per captured line, so writing never
// scrolls: a scroll would fill the new row with whatever background the
// previous line left active (tmux carries SGR state across -e lines).
const renderCapturedRows = async (params: {
  capture: TmuxPaneCapture;
  createEmulator: TerminalEmulatorFactory;
}): Promise<StyledRow[]> => {
  const { capture, createEmulator } = params;
  const emulator = createEmulator({ cols: capture.paneWidth, rows: capture.lines.length });
  await new Promise<void>((resolve) => {
    emulator.write(capture.lines.join('\r\n'), resolve);
  });

  return emulator.snapshotRows().rows.slice(-capture.lines.length);
};

export const tmuxPaneDocumentUtil = {
  async toDocument(params: {
    capture: TmuxPaneCapture;
    createEmulator: TerminalEmulatorFactory;
    screenRowCount: number;
  }): Promise<TmuxPaneDocument> {
    const { capture, createEmulator, screenRowCount } = params;
    const capturedRows = await renderCapturedRows({ capture, createEmulator });
    // The copy-mode window sits scrollPosition rows above the live pane top,
    // and the live screen shows the pane paneTop rows below its own top.
    const windowTopLine = capture.historyRowCount - Math.min(capture.scrollPosition, capture.historyRowCount);
    const leadingPadCount = Math.max(0, capture.paneTop - windowTopLine);
    const screenTopLine = leadingPadCount + windowTopLine - capture.paneTop;
    const rowsBeforeTrailingPad = leadingPadCount + capturedRows.length;
    const trailingPadCount = screenTopLine + screenRowCount - rowsBeforeTrailingPad;
    const rows = [...emptyRows(leadingPadCount), ...capturedRows, ...emptyRows(trailingPadCount)];

    return {
      colOffset: capture.paneLeft,
      screenTopLine,
      snapshot: {
        // No caret: the document is a read-only copy, not the live prompt.
        cursor: { x: 0, y: -1 },
        firstLine: 0,
        isAlternateBuffer: false,
        rows,
        viewportRowCount: rows.length,
      },
    };
  },
};
