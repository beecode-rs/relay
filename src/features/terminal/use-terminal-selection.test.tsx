import { act, renderHook } from '@testing-library/react-native';

import { useTerminalSelection } from '@/features/terminal/use-terminal-selection';
import type { StyledRow, TerminalSnapshot } from '@/services/terminal/terminal-serializer';

const rowOf = (...texts: string[]): StyledRow => {
  return {
    segments: texts.map((text) => {
      return { bold: false, inverse: false, text, underline: false };
    }),
  };
};

const snapshotOf = (
  rows: StyledRow[],
  options: { firstLine?: number; isAlternateBuffer?: boolean } = {}
): TerminalSnapshot => {
  return {
    cursor: { x: 0, y: 0 },
    firstLine: options.firstLine ?? 0,
    isAlternateBuffer: options.isAlternateBuffer ?? false,
    rows,
    viewportRowCount: rows.length,
  };
};

type HookResult = ReturnType<typeof useTerminalSelection>;

const renderSelectionHook = async (
  snapshot: TerminalSnapshot = snapshotOf([rowOf('hello world')])
): Promise<{ current: () => HookResult; onCopyText: jest.Mock; rerender(next: TerminalSnapshot): void }> => {
  const onCopyText = jest.fn();
  const hook = await renderHook(
    (next: TerminalSnapshot) => {
      return useTerminalSelection({ onCopyText, snapshot: next });
    },
    { initialProps: snapshot }
  );
  return {
    current: () => {
      return hook.result.current;
    },
    onCopyText,
    rerender(next: TerminalSnapshot) {
      hook.rerender(next);
    },
  };
};

describe('useTerminalSelection', () => {
  it('starts with the last word selected and from active', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    expect(current().selection).toEqual({
      activeMarker: 'from',
      from: { col: 6, line: 0 },
      to: { col: 10, line: 0 },
    });
    expect(current().isAcceptable).toBe(true);
  });

  it('collapses onto the last line when the buffer has no words', async () => {
    const { current } = await renderSelectionHook(snapshotOf([rowOf(' '), rowOf('')]));
    await act(async () => {
      current().startFromLastWord();
    });
    expect(current().selection).toEqual({
      activeMarker: 'from',
      from: { col: 0, line: 1 },
      to: { col: 0, line: 1 },
    });
    expect(current().isAcceptable).toBe(false);
  });

  it('starts at a long-pressed word with to active', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().startAtPosition({ col: 1, line: 0 });
    });
    expect(current().selection).toEqual({
      activeMarker: 'to',
      from: { col: 0, line: 0 },
      to: { col: 4, line: 0 },
    });
  });

  it('switches the active marker from the toolbar', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    await act(async () => {
      current().setActiveMarker('to');
    });
    expect(current().selection?.activeMarker).toBe('to');
  });

  it('toggles the active marker back and forth on double taps', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    await act(async () => {
      current().switchActiveMarker();
    });
    expect(current().selection?.activeMarker).toBe('to');
    await act(async () => {
      current().switchActiveMarker();
    });
    expect(current().selection?.activeMarker).toBe('from');
  });

  it('ignores marker switches while idle', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().switchActiveMarker();
    });
    expect(current().selection).toBeNull();
  });

  it('moves the active marker and swaps roles on crossing', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    await act(async () => {
      current().moveActiveMarkerTo({ col: 12, line: 0 });
    });
    expect(current().selection).toEqual({
      activeMarker: 'to',
      from: { col: 10, line: 0 },
      to: { col: 11, line: 0 },
    });
  });

  it('ignores marker moves while idle', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().moveActiveMarkerTo({ col: 1, line: 0 });
    });
    expect(current().selection).toBeNull();
  });

  it('cancels an active selection', async () => {
    const { current } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    await act(async () => {
      current().cancel();
    });
    expect(current().selection).toBeNull();
  });

  it('accepts by copying the selected text and clearing the selection', async () => {
    const { current, onCopyText } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    await act(async () => {
      current().accept();
    });
    expect(onCopyText).toHaveBeenCalledWith('world');
    expect(current().selection).toBeNull();
  });

  it('skips accepting when there is nothing selected', async () => {
    const { current, onCopyText } = await renderSelectionHook();
    await act(async () => {
      current().accept();
    });
    expect(onCopyText).not.toHaveBeenCalled();
  });

  it('skips accepting a whitespace-only selection', async () => {
    const { current, onCopyText } = await renderSelectionHook(snapshotOf([rowOf('   x  ')]));
    await act(async () => {
      current().startAtPosition({ col: 1, line: 0 });
    });
    expect(current().isAcceptable).toBe(false);
    await act(async () => {
      current().accept();
    });
    expect(onCopyText).not.toHaveBeenCalled();
    expect(current().selection).not.toBeNull();
  });

  it('clamps the selection when the snapshot shrinks', async () => {
    const { current, rerender } = await renderSelectionHook(
      snapshotOf([rowOf('first'), rowOf('second'), rowOf('third')])
    );
    await act(async () => {
      current().startAtPosition({ col: 0, line: 2 });
    });
    await act(async () => {
      rerender(snapshotOf([rowOf('only')], { firstLine: 2 }));
    });
    expect(current().selection).toEqual({
      activeMarker: 'to',
      from: { col: 0, line: 2 },
      to: { col: 4, line: 2 },
    });
  });

  it('cancels the selection when the buffer kind flips', async () => {
    const { current, rerender } = await renderSelectionHook();
    await act(async () => {
      current().startFromLastWord();
    });
    await act(async () => {
      rerender(snapshotOf([rowOf('vim')], { isAlternateBuffer: true }));
    });
    expect(current().selection).toBeNull();
  });
});
