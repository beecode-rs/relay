import { createTerminalEmulator } from '@/services/terminal/terminal-emulator';
import type { StyledRow } from '@/services/terminal/terminal-serializer';
import type { TmuxPaneCapture } from '@/services/terminal/tmux-attach';
import { tmuxPaneDocumentUtil } from '@/services/terminal/tmux-pane-document';

const rowTexts = (rows: StyledRow[]): string[] => {
  return rows.map((row) => {
    return row.segments
      .map((segment) => {
        return segment.text;
      })
      .join('');
  });
};

const captureOf = (overrides: Partial<TmuxPaneCapture>): TmuxPaneCapture => {
  const lines = overrides.lines ?? ['h-1', 'h-2', 'h-3', 'live-1', 'live-2'];
  const paneHeight = overrides.paneHeight ?? 2;
  return {
    historyRowCount: lines.length - paneHeight,
    lines,
    paneHeight,
    paneLeft: 0,
    paneTop: 0,
    paneWidth: 20,
    scrollPosition: 0,
    ...overrides,
  };
};

const toDocument = (capture: TmuxPaneCapture, screenRowCount: number) => {
  return tmuxPaneDocumentUtil.toDocument({
    capture,
    createEmulator: createTerminalEmulator,
    screenRowCount,
  });
};

describe('tmuxPaneDocumentUtil.toDocument', () => {
  it('maps the live screen onto the pane bottom and pads the bottom status line', async () => {
    const document = await toDocument(captureOf({}), 3);
    expect(rowTexts(document.snapshot.rows)).toEqual(['h-1', 'h-2', 'h-3', 'live-1', 'live-2', '']);
    expect(document.screenTopLine).toBe(3);
    expect(document.snapshot.firstLine).toBe(0);
    expect(document.snapshot.cursor.y).toBe(-1);
  });

  it('maps the live screen onto the copy-mode window', async () => {
    const document = await toDocument(captureOf({ scrollPosition: 2 }), 2);
    expect(document.screenTopLine).toBe(1);
    expect(rowTexts(document.snapshot.rows).slice(1, 3)).toEqual(['h-2', 'h-3']);
  });

  it('pads above when a top status line sits over a window at the history top', async () => {
    const document = await toDocument(
      captureOf({ lines: ['live-1', 'live-2'], paneTop: 1, scrollPosition: 0 }),
      3
    );
    expect(rowTexts(document.snapshot.rows)).toEqual(['', 'live-1', 'live-2']);
    expect(document.screenTopLine).toBe(0);
  });

  it('offsets columns by the pane left edge', async () => {
    const document = await toDocument(captureOf({ paneLeft: 41 }), 2);
    expect(document.colOffset).toBe(41);
  });

  it('keeps the colors carried by the captured SGR codes', async () => {
    const document = await toDocument(
      captureOf({ lines: ['\x1b[31mred', 'still red\x1b[39m'], paneHeight: 2 }),
      2
    );
    expect(document.snapshot.rows[0].segments[0].fgColor).toBeDefined();
    expect(document.snapshot.rows[1].segments[0].fgColor).toBe(
      document.snapshot.rows[0].segments[0].fgColor
    );
  });
});
