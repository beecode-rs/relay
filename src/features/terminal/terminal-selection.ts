import type { StyledRow, TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import type { TerminalGrapheme } from '@/services/terminal/terminal-unicode-provider';
import { terminalUnicodeWidthUtil } from '@/services/terminal/terminal-unicode-provider';

export type TerminalSelectionMarkerName = 'from' | 'to';

export type TerminalSelectionPosition = {
  col: number;
  line: number;
};

export type TerminalSelectionState = {
  activeMarker: TerminalSelectionMarkerName;
  from: TerminalSelectionPosition;
  to: TerminalSelectionPosition;
  // Remote-viewport selections can outgrow the snapshot: rows the tmux
  // viewport scrolled past are kept here, ordered nearest-viewport first for
  // tail rows and nearest-viewport last for head rows.
  headRows?: readonly string[];
  tailRows?: readonly string[];
};

export type TerminalSelectionRange = {
  end: TerminalSelectionPosition;
  start: TerminalSelectionPosition;
};

export type TerminalRowSelection = {
  activeMarker: TerminalSelectionMarkerName;
  endColumn: number;
  fromMarkerColumn: number | null;
  startColumn: number;
  toMarkerColumn: number | null;
};

export const rowTextOf = (row: StyledRow): string => {
  return row.segments.reduce((text, segment) => {
    return text + segment.text;
  }, '');
};

/** Grid columns a row occupies under the unicode provider's widths. */
export const rowWidthOf = (row: StyledRow): number => {
  return terminalUnicodeWidthUtil.widthOf(rowTextOf(row));
};

export const comparePositions = (
  a: TerminalSelectionPosition,
  b: TerminalSelectionPosition
): number => {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.col - b.col;
};

export const orderedRangeOf = (state: TerminalSelectionState): TerminalSelectionRange => {
  if (comparePositions(state.from, state.to) <= 0) {
    return { end: state.to, start: state.from };
  }
  return { end: state.from, start: state.to };
};

const isWordChar = (char: string): boolean => {
  return /\S/.test(char);
};

const wordStartCol = (text: string, col: number): number => {
  if (col > 0 && isWordChar(text[col - 1] as string)) {
    return wordStartCol(text, col - 1);
  }

  return col;
};

const wordEndCol = (text: string, col: number): number => {
  if (col < text.length - 1 && isWordChar(text[col + 1] as string)) {
    return wordEndCol(text, col + 1);
  }

  return col;
};

export const lastWordRange = (snapshot: TerminalSnapshot): TerminalSelectionRange | null => {
  const lastMatch = snapshot.rows.reduce<{ endCol: number; index: number; startCol: number } | null>(
    (found, row, index) => {
      const text = rowTextOf(row as StyledRow);
      const match = text.match(/\S+$/);
      if (match !== null && match.index !== undefined) {
        return {
          endCol: terminalUnicodeWidthUtil.columnOfTextIndex(text, match.index + match[0].length - 1),
          index,
          startCol: terminalUnicodeWidthUtil.columnOfTextIndex(text, match.index),
        };
      }

      return found;
    },
    null
  );
  if (lastMatch === null) {
    return null;
  }
  const line = snapshot.firstLine + lastMatch.index;

  return { end: { col: lastMatch.endCol, line }, start: { col: lastMatch.startCol, line } };
};

export const wordRangeAt = (
  snapshot: TerminalSnapshot,
  position: TerminalSelectionPosition
): TerminalSelectionRange => {
  if (snapshot.rows.length === 0) {
    return { end: { col: 0, line: snapshot.firstLine }, start: { col: 0, line: snapshot.firstLine } };
  }
  const lastRowIndex = snapshot.rows.length - 1;
  const rowIndex = Math.min(Math.max(position.line - snapshot.firstLine, 0), lastRowIndex);
  const line = snapshot.firstLine + rowIndex;
  const row = snapshot.rows[rowIndex] as StyledRow;
  const text = rowTextOf(row);
  const rowWidth = rowWidthOf(row);
  if (rowWidth === 0) {
    return { end: { col: 0, line }, start: { col: 0, line } };
  }
  const col = Math.min(Math.max(position.col, 0), rowWidth - 1);
  // Columns are grid cells; word walking happens over the text, so map in
  // and back out through the provider's grapheme widths.
  const textIndex = terminalUnicodeWidthUtil.textIndexOfColumn(text, col);
  if (textIndex >= text.length || !isWordChar(text.charAt(textIndex))) {
    return { end: { col, line }, start: { col, line } };
  }

  return {
    end: {
      col: terminalUnicodeWidthUtil.columnOfTextIndex(text, wordEndCol(text, textIndex)),
      line,
    },
    start: {
      col: terminalUnicodeWidthUtil.columnOfTextIndex(text, wordStartCol(text, textIndex)),
      line,
    },
  };
};

const flipMarker = (marker: TerminalSelectionMarkerName): TerminalSelectionMarkerName => {
  if (marker === 'from') {
    return 'to';
  }
  return 'from';
};

export const moveActiveMarker = (
  state: TerminalSelectionState,
  position: TerminalSelectionPosition
): TerminalSelectionState => {
  const moved = { ...state };
  if (state.activeMarker === 'from') {
    moved.from = position;
  } else {
    moved.to = position;
  }
  if (comparePositions(moved.from, moved.to) <= 0) {
    return moved;
  }
  return {
    ...moved,
    activeMarker: flipMarker(state.activeMarker),
    from: moved.to,
    to: moved.from,
  };
};

export const clampPosition = (
  position: TerminalSelectionPosition,
  snapshot: TerminalSnapshot
): TerminalSelectionPosition => {
  const firstLine = snapshot.firstLine;
  const lastLine = snapshot.firstLine + snapshot.rows.length - 1;
  const line = Math.min(Math.max(position.line, firstLine), Math.max(firstLine, lastLine));
  const row = snapshot.rows[line - snapshot.firstLine];
  const rowWidth = row === undefined ? 0 : rowWidthOf(row);
  const col = Math.min(Math.max(position.col, 0), rowWidth);
  if (line === position.line && col === position.col) {
    return position;
  }
  return { col, line };
};

export const clampSelection = (
  state: TerminalSelectionState,
  snapshot: TerminalSnapshot
): TerminalSelectionState => {
  const from = clampPosition(state.from, snapshot);
  const to = clampPosition(state.to, snapshot);
  if (from === state.from && to === state.to) {
    return state;
  }
  return { ...state, from, to };
};

// Like clampSelection, but a position the viewport shift pushed past an edge
// stays out of range as far as the recorded overflow rows track it; only the
// inactive marker ever earns that extent, and moves clamp it back in.
export const clampSelectionOverflowing = (
  state: TerminalSelectionState,
  snapshot: TerminalSnapshot
): TerminalSelectionState => {
  const headExtent = state.headRows?.length ?? 0;
  const tailExtent = state.tailRows?.length ?? 0;
  if (headExtent === 0 && tailExtent === 0) {
    return clampSelection(state, snapshot);
  }
  const firstLine = snapshot.firstLine;
  const lastLine = lastLineOf(snapshot);
  const clampOverflowingPosition = (
    position: TerminalSelectionPosition
  ): TerminalSelectionPosition => {
    const line = Math.min(Math.max(position.line, firstLine - headExtent), lastLine + tailExtent);
    const row = snapshot.rows[line - snapshot.firstLine];
    if (row === undefined) {
      return line === position.line ? position : { ...position, line };
    }
    const col = Math.min(Math.max(position.col, 0), rowWidthOf(row));
    if (line === position.line && col === position.col) {
      return position;
    }
    return { col, line };
  };
  const from = clampOverflowingPosition(state.from);
  const to = clampOverflowingPosition(state.to);
  if (from === state.from && to === state.to) {
    return state;
  }
  return { ...state, from, to };
};

const lastLineOf = (snapshot: TerminalSnapshot): number => {
  return snapshot.firstLine + snapshot.rows.length - 1;
};

const isFromOrderedFirst = (state: TerminalSelectionState): boolean => {
  return comparePositions(state.from, state.to) <= 0;
};

const overflowRowsOf = (params: {
  capturedFromEnd: boolean;
  currentRows: readonly string[];
  previousRows: readonly StyledRow[];
  wantedCount: number;
}): readonly string[] => {
  const { capturedFromEnd, currentRows, previousRows, wantedCount } = params;
  if (wantedCount === currentRows.length) {
    return currentRows;
  }
  if (wantedCount < currentRows.length) {
    const removedCount = currentRows.length - wantedCount;
    return capturedFromEnd ? currentRows.slice(removedCount) : currentRows.slice(0, wantedCount);
  }
  const grownCount = wantedCount - currentRows.length;
  const fromIndex = capturedFromEnd ? previousRows.length - grownCount : 0;
  const capturedRows = previousRows.slice(fromIndex, fromIndex + grownCount).map(rowTextOf);
  return capturedFromEnd ? [...capturedRows, ...currentRows] : [...currentRows, ...capturedRows];
};

// A commanded remote scroll repaints the tmux viewport by shifting its content
// in place: scroll-up moves every row down, scroll-down moves every row up.
// The inactive marker keeps pointing at the same content by moving with the
// shift; rows it passes beyond the snapshot edge are captured into head/tail
// overflow so a selection can span many viewport lengths.
export const applyViewportShift = (
  state: TerminalSelectionState,
  params: { previousSnapshot: TerminalSnapshot; rows: number; snapshot: TerminalSnapshot }
): TerminalSelectionState => {
  const { previousSnapshot, rows, snapshot } = params;
  if (rows === 0) {
    return state;
  }
  const inactiveMarker = state.activeMarker === 'from' ? 'to' : 'from';
  const inactivePosition = state[inactiveMarker];
  const shiftedPosition = { ...inactivePosition, line: inactivePosition.line + rows };
  const shiftedState = { ...state, [inactiveMarker]: shiftedPosition };
  const range = orderedRangeOf(shiftedState);
  const tailRows = overflowRowsOf({
    capturedFromEnd: true,
    currentRows: shiftedState.tailRows ?? [],
    previousRows: previousSnapshot.rows,
    wantedCount: Math.max(0, range.end.line - lastLineOf(snapshot)),
  });
  const headRows = overflowRowsOf({
    capturedFromEnd: false,
    currentRows: shiftedState.headRows ?? [],
    previousRows: previousSnapshot.rows,
    wantedCount: Math.max(0, snapshot.firstLine - range.start.line),
  });
  return {
    ...shiftedState,
    headRows: headRows.length > 0 ? headRows : undefined,
    tailRows: tailRows.length > 0 ? tailRows : undefined,
  };
};

// Keeps a marker that the shift pushed past the snapshot edge addressable: it
// clamps onto the edge row with an extreme column so the whole edge row stays
// highlighted while its true position rides the overflow rows. The returned
// state drops the overflow fields - rendering only needs viewport positions.
export const renderableSelectionOf = (
  state: TerminalSelectionState,
  snapshot: TerminalSnapshot
): TerminalSelectionState => {
  const clamped = clampSelection(state, snapshot);
  const headRows = state.headRows ?? [];
  const tailRows = state.tailRows ?? [];
  if (headRows.length === 0 && tailRows.length === 0) {
    return clamped;
  }
  const range = orderedRangeOf(state);
  const fromIsFirst = isFromOrderedFirst(state);
  let from = clamped.from;
  let to = clamped.to;
  if (tailRows.length > 0 && range.end.line > lastLineOf(snapshot)) {
    const pinned = { col: Number.MAX_SAFE_INTEGER, line: lastLineOf(snapshot) };
    if (fromIsFirst) {
      to = pinned;
    } else {
      from = pinned;
    }
  }
  if (headRows.length > 0 && range.start.line < snapshot.firstLine) {
    const pinned = { col: 0, line: snapshot.firstLine };
    if (fromIsFirst) {
      from = pinned;
    } else {
      to = pinned;
    }
  }
  return { activeMarker: state.activeMarker, from, to };
};

// Marker moves address viewport rows only: beyond-edge content is reachable
// through scrolls, not drags, so a moved marker clamps into the snapshot while
// the overflow on its own side collapses back into the visible range.
export const withoutOverflowForMovedMarker = (
  state: TerminalSelectionState
): TerminalSelectionState => {
  const activeIsEnd = isFromOrderedFirst(state) ? state.activeMarker === 'to' : state.activeMarker === 'from';
  if (activeIsEnd && (state.tailRows?.length ?? 0) > 0) {
    return {
      ...(state.headRows !== undefined && state.headRows.length > 0 ? { headRows: state.headRows } : {}),
      activeMarker: state.activeMarker,
      from: state.from,
      to: state.to,
    };
  }
  if (!activeIsEnd && (state.headRows?.length ?? 0) > 0) {
    return {
      activeMarker: state.activeMarker,
      from: state.from,
      ...(state.tailRows !== undefined && state.tailRows.length > 0 ? { tailRows: state.tailRows } : {}),
      to: state.to,
    };
  }
  return state;
};

export const extractSelectedText = (
  snapshot: TerminalSnapshot,
  state: TerminalSelectionState
): string => {
  const range = orderedRangeOf(state);
  const firstLine = snapshot.firstLine;
  const lastLine = lastLineOf(snapshot);
  const startLine = Math.max(range.start.line, firstLine);
  const endLine = Math.min(range.end.line, lastLine);
  const lineCount = Math.max(0, endLine - startLine + 1);
  const lines = Array.from({ length: lineCount }, (_unused, index) => {
    const line = startLine + index;
    const row = snapshot.rows[line - snapshot.firstLine];
    if (row === undefined) {
      return '';
    }
    const text = rowTextOf(row);
    const isFirstLine = line === range.start.line;
    const isLastLine = line === range.end.line;
    if (!isFirstLine && !isLastLine) {
      return text;
    }
    // Selection columns are grid cells; convert them to text indexes over
    // whole graphemes so wide clusters are never cut in half.
    const graphemes = terminalUnicodeWidthUtil.toGraphemes(text);
    const graphemeAtColumn = (column: number): TerminalGrapheme | undefined => {
      return graphemes.find((grapheme) => {
        return column < grapheme.column + grapheme.width;
      });
    };
    const sliceStart = isFirstLine ? (graphemeAtColumn(range.start.col)?.start ?? text.length) : 0;
    const sliceEnd = isLastLine
      ? (graphemeAtColumn(range.end.col)?.end ?? text.length)
      : text.length;
    return text.slice(sliceStart, sliceEnd);
  });
  const headRows = state.headRows ?? [];
  const tailRows = state.tailRows ?? [];
  const sections: string[] = [];
  if (headRows.length > 0) {
    sections.push(headRows.join('\n'));
  }
  if (lines.length > 0) {
    sections.push(lines.join('\n'));
  }
  if (tailRows.length > 0) {
    sections.push(tailRows.join('\n'));
  }
  return sections.join('\n');
};

export const rowSelectionOf = (
  state: TerminalSelectionState,
  line: number,
  rowLength: number
): TerminalRowSelection | null => {
  const range = orderedRangeOf(state);
  if (line < range.start.line || line > range.end.line || rowLength <= 0) {
    return null;
  }
  const clampColumn = (col: number): number => {
    return Math.min(Math.max(col, 0), rowLength - 1);
  };
  return {
    activeMarker: state.activeMarker,
    endColumn: line === range.end.line ? clampColumn(range.end.col) : rowLength - 1,
    fromMarkerColumn: state.from.line === line ? clampColumn(state.from.col) : null,
    startColumn: line === range.start.line ? clampColumn(range.start.col) : 0,
    toMarkerColumn: state.to.line === line ? clampColumn(state.to.col) : null,
  };
};
