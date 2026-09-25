import type { StyledRow, TerminalSnapshot } from '@/services/terminal/terminal-serializer';

import {
  clampSelection,
  comparePositions,
  extractSelectedText,
  lastWordRange,
  moveActiveMarker,
  orderedRangeOf,
  rowSelectionOf,
  rowTextOf,
  wordRangeAt,
} from '@/features/terminal/terminal-selection';
import type {
  TerminalSelectionPosition,
  TerminalSelectionState,
} from '@/features/terminal/terminal-selection';

const rowOf = (...texts: string[]): StyledRow => {
  return {
    segments: texts.map((text) => {
      return { bold: false, inverse: false, text, underline: false };
    }),
  };
};

const snapshotOf = (rows: StyledRow[], firstLine = 0): TerminalSnapshot => {
  return {
    cursor: { x: 0, y: 0 },
    firstLine,
    isAlternateBuffer: false,
    rows,
    viewportRowCount: rows.length,
  };
};

const selectionOf = (
  from: TerminalSelectionPosition,
  to: TerminalSelectionPosition,
  activeMarker: TerminalSelectionState['activeMarker'] = 'from'
): TerminalSelectionState => {
  return { activeMarker, from, to };
};

const position = (line: number, col: number): TerminalSelectionPosition => {
  return { col, line };
};

describe('rowTextOf', () => {
  it('concatenates the segment texts of a row', () => {
    expect(rowTextOf(rowOf('hello ', 'red', '!'))).toBe('hello red!');
  });
});

describe('comparePositions', () => {
  it('orders by line first and then by column', () => {
    expect(comparePositions(position(3, 9), position(5, 0))).toBeLessThan(0);
    expect(comparePositions(position(5, 3), position(5, 9))).toBeLessThan(0);
    expect(comparePositions(position(5, 9), position(5, 3))).toBeGreaterThan(0);
    expect(comparePositions(position(5, 4), position(5, 4))).toBe(0);
  });
});

describe('orderedRangeOf', () => {
  it('returns the stored order when from already precedes to', () => {
    const state = selectionOf(position(2, 0), position(4, 3));
    expect(orderedRangeOf(state)).toEqual({ end: position(4, 3), start: position(2, 0) });
  });

  it('swaps the endpoints when to precedes from', () => {
    const state = selectionOf(position(6, 5), position(4, 1));
    expect(orderedRangeOf(state)).toEqual({ end: position(6, 5), start: position(4, 1) });
  });
});

describe('lastWordRange', () => {
  it('selects the trailing word of the last non-blank row', () => {
    const snapshot = snapshotOf([rowOf('hello world'), rowOf('')]);
    expect(lastWordRange(snapshot)).toEqual({
      end: position(0, 10),
      start: position(0, 6),
    });
  });

  it('skips trailing blank rows', () => {
    const snapshot = snapshotOf([rowOf('one'), rowOf('   '), rowOf('  ')]);
    expect(lastWordRange(snapshot)).toEqual({
      end: position(0, 2),
      start: position(0, 0),
    });
  });

  it('keeps adjacent punctuation as part of the word', () => {
    const snapshot = snapshotOf([rowOf('done; ok!')]);
    expect(lastWordRange(snapshot)).toEqual({
      end: position(0, 8),
      start: position(0, 6),
    });
  });

  it('joins segment texts before finding the word', () => {
    const snapshot = snapshotOf([rowOf('git sta', 'tus')]);
    expect(lastWordRange(snapshot)).toEqual({
      end: position(0, 9),
      start: position(0, 4),
    });
  });

  it('returns null for an all-blank buffer', () => {
    expect(lastWordRange(snapshotOf([rowOf(' '), rowOf('')]))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(lastWordRange(snapshotOf([]))).toBeNull();
  });

  it('reports positions in absolute line space', () => {
    const snapshot = snapshotOf([rowOf('alpha'), rowOf('beta')], 40);
    expect(lastWordRange(snapshot)).toEqual({
      end: position(41, 3),
      start: position(41, 0),
    });
  });
});

describe('wordRangeAt', () => {
  it('expands to the word around the touched column', () => {
    const snapshot = snapshotOf([rowOf('hello world')]);
    expect(wordRangeAt(snapshot, position(0, 7))).toEqual({
      end: position(0, 10),
      start: position(0, 6),
    });
  });

  it('finds single-character words', () => {
    const snapshot = snapshotOf([rowOf('a b c')]);
    expect(wordRangeAt(snapshot, position(0, 2))).toEqual({
      end: position(0, 2),
      start: position(0, 2),
    });
  });

  it('collapses when the touched column is whitespace', () => {
    const snapshot = snapshotOf([rowOf('hello world')]);
    expect(wordRangeAt(snapshot, position(0, 5))).toEqual({
      end: position(0, 5),
      start: position(0, 5),
    });
  });

  it('clamps an out-of-range line and column', () => {
    const snapshot = snapshotOf([rowOf('one'), rowOf('three')], 10);
    expect(wordRangeAt(snapshot, position(99, 99))).toEqual({
      end: position(11, 4),
      start: position(11, 0),
    });
  });

  it('collapses on an empty row', () => {
    const snapshot = snapshotOf([rowOf('one'), rowOf('')]);
    expect(wordRangeAt(snapshot, position(1, 0))).toEqual({
      end: position(1, 0),
      start: position(1, 0),
    });
  });

  it('collapses without rows', () => {
    expect(wordRangeAt(snapshotOf([]), position(7, 3))).toEqual({
      end: position(0, 0),
      start: position(0, 0),
    });
  });
});

describe('moveActiveMarker', () => {
  it('moves the active marker without swapping when order holds', () => {
    const state = selectionOf(position(0, 0), position(0, 5));
    const next = moveActiveMarker(state, position(0, 3));
    expect(next).toEqual({ activeMarker: 'from', from: position(0, 3), to: position(0, 5) });
  });

  it('swaps labels when from crosses past to', () => {
    const state = selectionOf(position(0, 2), position(0, 6), 'from');
    const next = moveActiveMarker(state, position(0, 9));
    expect(next).toEqual({ activeMarker: 'to', from: position(0, 6), to: position(0, 9) });
  });

  it('swaps labels when to crosses before from', () => {
    const state = selectionOf(position(0, 2), position(0, 6), 'to');
    const next = moveActiveMarker(state, position(0, 0));
    expect(next).toEqual({ activeMarker: 'from', from: position(0, 0), to: position(0, 2) });
  });

  it('keeps the stored from at or before to across crossings', () => {
    const state = selectionOf(position(2, 4), position(2, 4), 'from');
    const crossed = moveActiveMarker(state, position(5, 1));
    expect(comparePositions(crossed.from, crossed.to)).toBeLessThanOrEqual(0);
    const recrossed = moveActiveMarker(crossed, position(0, 0));
    expect(comparePositions(recrossed.from, recrossed.to)).toBeLessThanOrEqual(0);
    expect(recrossed.activeMarker).toBe('from');
  });

  it('keeps the active marker when it lands exactly on the other marker', () => {
    const state = selectionOf(position(1, 0), position(1, 4), 'to');
    expect(moveActiveMarker(state, position(1, 0))).toEqual({
      activeMarker: 'to',
      from: position(1, 0),
      to: position(1, 0),
    });
  });
});

describe('clampSelection', () => {
  it('returns the same reference when nothing changes', () => {
    const state = selectionOf(position(0, 0), position(1, 3));
    expect(clampSelection(state, snapshotOf([rowOf('hello'), rowOf('world')]))).toBe(state);
  });

  it('pulls markers onto surviving rows when scrollback trims', () => {
    const state = selectionOf(position(2, 1), position(6, 2));
    const clamped = clampSelection(state, snapshotOf([rowOf('late-a'), rowOf('late-b')], 5));
    expect(clamped).toEqual({ activeMarker: 'from', from: position(5, 1), to: position(6, 2) });
  });

  it('clamps columns to the row text length', () => {
    const state = selectionOf(position(0, 99), position(1, 99));
    const clamped = clampSelection(state, snapshotOf([rowOf('hi'), rowOf('there')]));
    expect(clamped).toEqual({ activeMarker: 'from', from: position(0, 2), to: position(1, 5) });
  });

  it('collapses onto firstLine for an empty buffer', () => {
    const state = selectionOf(position(0, 3), position(9, 1));
    expect(clampSelection(state, snapshotOf([], 12))).toEqual({
      activeMarker: 'from',
      from: position(12, 0),
      to: position(12, 0),
    });
  });
});

describe('extractSelectedText', () => {
  it('extracts a partial single row inclusively', () => {
    const snapshot = snapshotOf([rowOf('hello world')]);
    expect(extractSelectedText(snapshot, selectionOf(position(0, 6), position(0, 10)))).toBe(
      'world'
    );
  });

  it('extracts across rows with partial end rows', () => {
    const snapshot = snapshotOf([rowOf('alpha'), rowOf('beta'), rowOf('gamma')]);
    expect(extractSelectedText(snapshot, selectionOf(position(0, 3), position(2, 2)))).toBe(
      'ha\nbeta\ngam'
    );
  });

  it('keeps blank interior rows as empty lines', () => {
    const snapshot = snapshotOf([rowOf('a'), rowOf(''), rowOf('b')]);
    expect(extractSelectedText(snapshot, selectionOf(position(0, 0), position(2, 0)))).toBe(
      'a\n\nb'
    );
  });

  it('returns empty text for a range past the trimmed row content', () => {
    const snapshot = snapshotOf([rowOf('hi')]);
    expect(extractSelectedText(snapshot, selectionOf(position(0, 5), position(0, 8)))).toBe('');
  });
});

describe('rowSelectionOf', () => {
  it('returns null outside the selected lines', () => {
    const state = selectionOf(position(1, 0), position(2, 3));
    expect(rowSelectionOf(state, 0, 5)).toBeNull();
    expect(rowSelectionOf(state, 3, 5)).toBeNull();
  });

  it('returns null for an empty row', () => {
    const state = selectionOf(position(0, 0), position(2, 1));
    expect(rowSelectionOf(state, 1, 0)).toBeNull();
  });

  it('describes a single-line selection with both markers', () => {
    const state = selectionOf(position(1, 2), position(1, 5), 'to');
    expect(rowSelectionOf(state, 1, 10)).toEqual({
      activeMarker: 'to',
      endColumn: 5,
      fromMarkerColumn: 2,
      startColumn: 2,
      toMarkerColumn: 5,
    });
  });

  it('covers the first row to its end and the last row from its start', () => {
    const state = selectionOf(position(0, 4), position(2, 1));
    expect(rowSelectionOf(state, 0, 6)).toMatchObject({ endColumn: 5, startColumn: 4 });
    expect(rowSelectionOf(state, 1, 3)).toMatchObject({ endColumn: 2, startColumn: 0 });
    expect(rowSelectionOf(state, 2, 8)).toMatchObject({ endColumn: 1, startColumn: 0 });
  });

  it('clamps marker columns into the row length', () => {
    const state = selectionOf(position(0, 99), position(0, 99));
    expect(rowSelectionOf(state, 0, 4)).toEqual({
      activeMarker: 'from',
      endColumn: 3,
      fromMarkerColumn: 3,
      startColumn: 3,
      toMarkerColumn: 3,
    });
  });

  it('marks markers only on their own rows', () => {
    const state = selectionOf(position(0, 1), position(2, 1));
    expect(rowSelectionOf(state, 1, 4)).toEqual({
      activeMarker: 'from',
      endColumn: 3,
      fromMarkerColumn: null,
      startColumn: 0,
      toMarkerColumn: null,
    });
  });
});
