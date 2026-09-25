import type { StyledRow, TerminalSnapshot } from '@/services/terminal/terminal-serializer';

export type TerminalSelectionMarkerName = 'from' | 'to';

export type TerminalSelectionPosition = {
  col: number;
  line: number;
};

export type TerminalSelectionState = {
  activeMarker: TerminalSelectionMarkerName;
  from: TerminalSelectionPosition;
  to: TerminalSelectionPosition;
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
        return { endCol: match.index + match[0].length - 1, index, startCol: match.index };
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
  const text = rowTextOf(snapshot.rows[rowIndex] as StyledRow);
  if (text.length === 0) {
    return { end: { col: 0, line }, start: { col: 0, line } };
  }
  const col = Math.min(Math.max(position.col, 0), text.length - 1);
  if (!isWordChar(text[col] as string)) {
    return { end: { col, line }, start: { col, line } };
  }

  return { end: { col: wordEndCol(text, col), line }, start: { col: wordStartCol(text, col), line } };
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
    activeMarker: flipMarker(state.activeMarker),
    from: moved.to,
    to: moved.from,
  };
};

const clampPosition = (
  position: TerminalSelectionPosition,
  snapshot: TerminalSnapshot
): TerminalSelectionPosition => {
  const firstLine = snapshot.firstLine;
  const lastLine = snapshot.firstLine + snapshot.rows.length - 1;
  const line = Math.min(Math.max(position.line, firstLine), Math.max(firstLine, lastLine));
  const row = snapshot.rows[line - snapshot.firstLine];
  const textLength = row === undefined ? 0 : rowTextOf(row).length;
  const col = Math.min(Math.max(position.col, 0), textLength);
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

export const extractSelectedText = (
  snapshot: TerminalSnapshot,
  state: TerminalSelectionState
): string => {
  const range = orderedRangeOf(state);
  const lineCount = range.end.line - range.start.line + 1;
  const lines = Array.from({ length: lineCount }, (_unused, index) => {
    const line = range.start.line + index;
    const row = snapshot.rows[line - snapshot.firstLine];
    if (row === undefined) {
      return '';
    }
    const text = rowTextOf(row);
    const isFirstLine = index === 0;
    const isLastLine = index === lineCount - 1;
    const startCol = isFirstLine ? Math.min(range.start.col, text.length) : 0;
    const endCol = isLastLine ? Math.min(range.end.col + 1, text.length) : text.length;
    return text.slice(startCol, endCol);
  });
  return lines.join('\n');
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
