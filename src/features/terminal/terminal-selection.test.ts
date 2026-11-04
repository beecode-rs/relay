import type { StyledRow, TerminalSnapshot } from '@/services/terminal/terminal-serializer';

import {
  applyViewportShift,
  clampSelection,
  clampSelectionOverflowing,
  comparePositions,
  extractSelectedText,
  lastWordRange,
  moveActiveMarker,
  orderedRangeOf,
  renderableSelectionOf,
  rowSelectionOf,
  rowTextOf,
  withoutOverflowForMovedMarker,
  wordRangeAt,
} from '@/features/terminal/terminal-selection';
import type {
  TerminalSelectionPosition,
  TerminalSelectionState,
} from '@/features/terminal/terminal-selection';

const rowOf = (...texts: string[]): StyledRow => {
  return {
    segments: texts.map((text) => {
      return { bold: false, inverse: false, italic: false, text, underline: false };
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

describe('applyViewportShift', () => {
  const rowsOf = (...texts: string[]): StyledRow[] => {
    return texts.map((text) => {
      return rowOf(text);
    });
  };

  it('moves the inactive marker with the content', () => {
    const state = selectionOf(position(0, 0), position(2, 3), 'from');
    const shifted = applyViewportShift(state, {
      previousSnapshot: snapshotOf(rowsOf('row-a', 'row-b', 'row-c', 'row-d')),
      rows: 1,
      snapshot: snapshotOf(rowsOf('new', 'row-a', 'row-b', 'row-c')),
    });
    expect(shifted).toEqual({ activeMarker: 'from', from: position(0, 0), to: position(3, 3) });
  });

  it('keeps the active marker in place for the gesture to re-emit', () => {
    const state = selectionOf(position(0, 0), position(2, 3), 'to');
    const shifted = applyViewportShift(state, {
      previousSnapshot: snapshotOf(rowsOf('row-a', 'row-b', 'row-c', 'row-d')),
      rows: 1,
      snapshot: snapshotOf(rowsOf('new', 'row-a', 'row-b', 'row-c')),
    });
    expect(shifted.from).toEqual(position(1, 0));
    expect(shifted.to).toEqual(position(2, 3));
  });

  it('captures tail rows as the pushed end leaves the viewport', () => {
    const state = selectionOf(position(0, 0), position(3, 3), 'from');
    const first = applyViewportShift(state, {
      previousSnapshot: snapshotOf(rowsOf('row-a', 'row-b', 'row-c', 'row-d')),
      rows: 1,
      snapshot: snapshotOf(rowsOf('new', 'row-a', 'row-b', 'row-c')),
    });
    expect(first.to).toEqual(position(4, 3));
    expect(first.tailRows).toEqual(['row-d']);
    const second = applyViewportShift(first, {
      previousSnapshot: snapshotOf(rowsOf('new', 'row-a', 'row-b', 'row-c')),
      rows: 1,
      snapshot: snapshotOf(rowsOf('new2', 'new', 'row-a', 'row-b')),
    });
    expect(second.to).toEqual(position(5, 3));
    expect(second.tailRows).toEqual(['row-c', 'row-d']);
  });

  it('captures head rows as the pushed start leaves the viewport upward', () => {
    const state = selectionOf(position(0, 0), position(3, 0), 'to');
    const first = applyViewportShift(state, {
      previousSnapshot: snapshotOf(rowsOf('row-a', 'row-b', 'row-c', 'row-d')),
      rows: -1,
      snapshot: snapshotOf(rowsOf('row-b', 'row-c', 'row-d', 'new')),
    });
    expect(first.from).toEqual(position(-1, 0));
    expect(first.headRows).toEqual(['row-a']);
    const second = applyViewportShift(first, {
      previousSnapshot: snapshotOf(rowsOf('row-b', 'row-c', 'row-d', 'new')),
      rows: -1,
      snapshot: snapshotOf(rowsOf('row-c', 'row-d', 'new', 'new2')),
    });
    expect(second.from).toEqual(position(-2, 0));
    expect(second.headRows).toEqual(['row-a', 'row-b']);
  });

  it('returns rows to the viewport on the reverse shift', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 0),
      tailRows: ['row-c', 'row-d'],
      to: position(5, 3),
    };
    const reversed = applyViewportShift(state, {
      previousSnapshot: snapshotOf(rowsOf('new3', 'new2', 'new', 'row-a')),
      rows: -1,
      snapshot: snapshotOf(rowsOf('new2', 'new', 'row-a', 'row-b')),
    });
    expect(reversed.to).toEqual(position(4, 3));
    expect(reversed.tailRows).toEqual(['row-d']);
  });

  it('drops empty overflow instead of keeping empty arrays', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 0),
      tailRows: ['row-c'],
      to: position(4, 3),
    };
    const reversed = applyViewportShift(state, {
      previousSnapshot: snapshotOf(rowsOf('new2', 'new', 'row-a', 'row-b')),
      rows: -1,
      snapshot: snapshotOf(rowsOf('new', 'row-a', 'row-b', 'row-c')),
    });
    expect(reversed.to).toEqual(position(3, 3));
    expect(reversed.tailRows).toBeUndefined();
  });
});

describe('renderableSelectionOf', () => {
  const rowsOf = (...texts: string[]): StyledRow[] => {
    return texts.map((text) => {
      return rowOf(text);
    });
  };

  it('clamps like clampSelection without overflow', () => {
    const state = selectionOf(position(0, 2), position(2, 3));
    const snapshot = snapshotOf(rowsOf('row-a', 'row-b', 'row-c'));
    expect(renderableSelectionOf(state, snapshot)).toEqual(clampSelection(state, snapshot));
  });

  it('pins a tail-overflowing end onto the bottom row at its last column', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 1),
      tailRows: ['row-c'],
      to: position(4, 2),
    };
    const rendered = renderableSelectionOf(state, snapshotOf(rowsOf('new', 'row-a', 'row-b', 'row-c')));
    expect(rendered.to).toEqual({ col: Number.MAX_SAFE_INTEGER, line: 3 });
    expect(rendered.from).toEqual(position(0, 1));
  });

  it('pins a head-overflowing start onto the first row at column zero', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'to',
      from: position(-2, 4),
      headRows: ['row-a', 'row-b'],
      to: position(2, 0),
    };
    const rendered = renderableSelectionOf(state, snapshotOf(rowsOf('row-c', 'row-d', 'row-e', 'row-f')));
    expect(rendered.from).toEqual({ col: 0, line: 0 });
    expect(rendered.to).toEqual(position(2, 0));
  });
});

describe('clampSelectionOverflowing', () => {
  const rowsOf = (...texts: string[]): StyledRow[] => {
    return texts.map((text) => {
      return rowOf(text);
    });
  };

  it('keeps the shifted end as far as the tail rows track it', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 0),
      tailRows: ['row-c', 'row-d'],
      to: position(5, 2),
    };
    const clamped = clampSelectionOverflowing(state, snapshotOf(rowsOf('a', 'b', 'c', 'd')));
    expect(clamped.to).toEqual(position(5, 2));
  });

  it('clamps a position beyond the tracked extent', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 0),
      tailRows: ['row-c'],
      to: position(9, 2),
    };
    const clamped = clampSelectionOverflowing(state, snapshotOf(rowsOf('a', 'b', 'c', 'd')));
    expect(clamped.to).toEqual(position(4, 2));
  });

  it('falls back to clampSelection without overflow', () => {
    const state = selectionOf(position(0, 0), position(9, 1));
    expect(clampSelectionOverflowing(state, snapshotOf(rowsOf('a', 'b')))).toEqual(
      clampSelection(state, snapshotOf(rowsOf('a', 'b')))
    );
  });
});

describe('withoutOverflowForMovedMarker', () => {
  it('drops the tail when the moved marker is the ordered end', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'to',
      from: position(0, 0),
      headRows: ['above'],
      tailRows: ['below'],
      to: position(3, 2),
    };
    expect(withoutOverflowForMovedMarker(state)).toEqual({
      activeMarker: 'to',
      from: position(0, 0),
      headRows: ['above'],
      to: position(3, 2),
    });
  });

  it('drops the head when the moved marker is the ordered start', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 0),
      headRows: ['above'],
      tailRows: ['below'],
      to: position(3, 2),
    };
    expect(withoutOverflowForMovedMarker(state)).toEqual({
      activeMarker: 'from',
      from: position(0, 0),
      tailRows: ['below'],
      to: position(3, 2),
    });
  });

  it('keeps a state without overflow as the same reference', () => {
    const state = selectionOf(position(0, 0), position(1, 2));
    expect(withoutOverflowForMovedMarker(state)).toBe(state);
  });
});

describe('extractSelectedText with viewport overflow', () => {
  const rowsOf = (...texts: string[]): StyledRow[] => {
    return texts.map((text) => {
      return rowOf(text);
    });
  };

  it('appends the tail rows below the visible range', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 0),
      tailRows: ['row-b', 'row-c'],
      to: position(5, 2),
    };
    const snapshot = snapshotOf(rowsOf('new3', 'new2', 'new', 'row-a'));
    expect(extractSelectedText(snapshot, state)).toBe('new3\nnew2\nnew\nrow-a\nrow-b\nrow-c');
  });

  it('prepends the head rows above the visible range', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'to',
      from: position(-2, 0),
      headRows: ['row-a', 'row-b'],
      to: position(2, 1),
    };
    const snapshot = snapshotOf(rowsOf('row-c', 'row-d', 'row-e', 'row-f'));
    expect(extractSelectedText(snapshot, state)).toBe('row-a\nrow-b\nrow-c\nrow-d\nro');
  });

  it('slices the boundary columns only on lines the range truly ends on', () => {
    const state: TerminalSelectionState = {
      activeMarker: 'from',
      from: position(0, 3),
      tailRows: ['row-c'],
      to: position(4, 1),
    };
    const snapshot = snapshotOf(rowsOf('new2', 'new', 'row-a', 'row-b'));
    expect(extractSelectedText(snapshot, state)).toBe('2\nnew\nrow-a\nrow-b\nrow-c');
  });
});
