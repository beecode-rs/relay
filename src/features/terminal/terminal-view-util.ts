import { constant } from '@/constants/constant';
import type {
  TerminalSelectionMarkerName,
  TerminalSelectionPosition,
  TerminalRowSelection,
} from '@/features/terminal/terminal-selection';
import type { StyledRow, StyledSegment, TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import { terminalUnicodeWidthUtil } from '@/services/terminal/terminal-unicode-provider';

type SelectionCellKind = 'fromMarker' | 'selected' | 'toMarker';

export type TerminalRowPiece = {
  backgroundColor: string | null;
  segment: StyledSegment;
};

type SelectionRun = {
  kind: SelectionCellKind | null;
  text: string;
};

const EMPTY_CURSOR_SEGMENT: StyledSegment = {
  bold: false,
  inverse: true,
  italic: false,
  text: ' ',
  underline: false,
};

export const terminalViewUtil = {
  // Android collapses spaces at nested text-span boundaries during
  // measurement, so a row fragmented into space-leading/-trailing spans
  // (opencode's block-letter logo and its accent backgrounds) shifts every
  // following column left. The no-break space has the same 0.6em advance in
  // JetBrains Mono and is never collapsed, so rendered text swaps one for
  // one; selection geometry still measures the original space.
  toDisplayText(text: string): string {
    return text.replace(/ /g, '\u00A0');
  },

  autoScrollDirectionOf(params: {
    lineHeight: number;
    markerLine: number;
    offsetPx: number;
    snapshot: TerminalSnapshot;
    viewportHeightPx: number;
  }): number {
    const { lineHeight, markerLine, offsetPx, snapshot, viewportHeightPx } = params;
    if (lineHeight <= 0 || viewportHeightPx <= 0) {
      return 0;
    }
    const markerTopPx = (markerLine - snapshot.firstLine) * lineHeight - offsetPx;
    if (markerTopPx < lineHeight) {
      return -1;
    }
    if (markerTopPx + lineHeight > viewportHeightPx - lineHeight) {
      return 1;
    }
    return 0;
  },

  revealScrollOffsetOf(params: {
    contentHeightPx: number;
    lineHeight: number;
    markerLine: number;
    offsetPx: number;
    snapshot: TerminalSnapshot;
    viewportHeightPx: number;
  }): number | null {
    const { contentHeightPx, lineHeight, markerLine, offsetPx, snapshot, viewportHeightPx } = params;
    if (lineHeight <= 0 || viewportHeightPx <= 0) {
      return null;
    }
    const markerTopPx = (markerLine - snapshot.firstLine) * lineHeight - offsetPx;
    if (markerTopPx + lineHeight > 0 && markerTopPx < viewportHeightPx) {
      return null;
    }
    const maxOffsetPx = Math.max(0, contentHeightPx - viewportHeightPx);
    if (markerTopPx < 0) {
      return Math.min(Math.max(markerTopPx + offsetPx - lineHeight, 0), maxOffsetPx);
    }
    return Math.min(Math.max(markerTopPx + offsetPx - viewportHeightPx + 2 * lineHeight, 0), maxOffsetPx);
  },

  rowsScrolledBy(params: { deltaPx: number; lineHeight: number }): number {
    const { deltaPx, lineHeight } = params;
    if (lineHeight <= 0) {
      return 0;
    }
    const magnitude = Math.floor(Math.abs(deltaPx) / lineHeight);
    if (magnitude === 0) {
      return 0;
    }
    if (deltaPx < 0) {
      return magnitude;
    }

    return -magnitude;
  },

  scrollbackCountOf(params: { isRemoteScroll: boolean; snapshot: TerminalSnapshot }): number {
    const { isRemoteScroll, snapshot } = params;
    if (!isRemoteScroll) {
      return 0;
    }

    return Math.max(0, snapshot.rows.length - snapshot.viewportRowCount);
  },

  selectionPositionFromPoint(params: {
    charWidthPx: number;
    lineHeight: number;
    pointX: number;
    pointY: number;
    scrollbackCount: number;
    snapshot: TerminalSnapshot;
  }): TerminalSelectionPosition {
    const { charWidthPx, lineHeight, pointX, pointY, scrollbackCount, snapshot } = params;
    const firstLine = snapshot.firstLine;
    const lastLine = firstLine + snapshot.rows.length - 1;
    const rowOffset = this._unitsWithin({ dividendPx: pointY, divisorPx: lineHeight });
    const unclampedLine = firstLine + scrollbackCount + rowOffset;
    const line = Math.min(Math.max(unclampedLine, firstLine), Math.max(firstLine, lastLine));
    const col = this._unitsWithin({ dividendPx: pointX, divisorPx: charWidthPx });

    return { col, line };
  },

  splitRowForSelection(params: {
    selection: TerminalRowSelection;
    segments: StyledSegment[];
  }): TerminalRowPiece[] {
    const { selection, segments } = params;
    const columnEnds = this._columnEndsOf(segments);

    return segments.flatMap((segment, segmentIndex) => {
      const columnStart = columnEnds[segmentIndex] - terminalUnicodeWidthUtil.widthOf(segment.text);

      return this._selectionPiecesOf({ columnStart, selection, segment });
    });
  },

  splitRowForCursor(params: { cursorColumn: number; row: StyledRow }): StyledSegment[] {
    const { cursorColumn, row } = params;
    const columnEnds = this._columnEndsOf(row.segments);
    const hitIndex = row.segments.findIndex((_segment, segmentIndex) => {
      return cursorColumn < columnEnds[segmentIndex];
    });
    if (hitIndex === -1) {
      return this._segmentsWithTrailingCursor({
        cursorColumn,
        row,
        rowEndColumn: columnEnds[columnEnds.length - 1] ?? 0,
      });
    }
    const segment = row.segments[hitIndex];
    const segmentStartColumn = columnEnds[hitIndex] - terminalUnicodeWidthUtil.widthOf(segment.text);
    const graphemes = terminalUnicodeWidthUtil.toGraphemes(segment.text);
    const hitGrapheme = graphemes.find((grapheme) => {
      return cursorColumn - segmentStartColumn < grapheme.column + grapheme.width;
    });
    if (hitGrapheme === undefined) {
      return this._segmentsWithTrailingCursor({
        cursorColumn,
        row,
        rowEndColumn: columnEnds[columnEnds.length - 1] ?? 0,
      });
    }
    // The cursor highlights the whole grapheme under its column, so wide
    // emoji invert fully and clusters are never cut in half.
    const cursorSegment: StyledSegment = {
      ...segment,
      inverse: true,
      text: segment.text.slice(hitGrapheme.start, hitGrapheme.end),
    };
    const head = { ...segment, text: segment.text.slice(0, hitGrapheme.start) };
    const tail = [
      { ...segment, text: segment.text.slice(hitGrapheme.end) },
      ...row.segments.slice(hitIndex + 1),
    ];

    return [
      ...this._nonEmptySegments([...row.segments.slice(0, hitIndex), head]),
      cursorSegment,
      ...this._nonEmptySegments(tail),
    ];
  },

  _cellKindWithin(
    selection: TerminalRowSelection,
    fromColumn: number,
    toColumn: number
  ): SelectionCellKind | null {    if (
      selection.fromMarkerColumn !== null &&
      fromColumn <= selection.fromMarkerColumn &&
      selection.fromMarkerColumn <= toColumn
    ) {
      return 'fromMarker';
    }
    if (
      selection.toMarkerColumn !== null &&
      fromColumn <= selection.toMarkerColumn &&
      selection.toMarkerColumn <= toColumn
    ) {
      return 'toMarker';
    }
    if (toColumn >= selection.startColumn && fromColumn <= selection.endColumn) {
      return 'selected';
    }

    return null;
  },

  _columnEndsOf(segments: StyledSegment[]): number[] {
    return segments.reduce<number[]>((ends, segment) => {
      const previousEnd = ends[ends.length - 1] ?? 0;
      ends.push(previousEnd + terminalUnicodeWidthUtil.widthOf(segment.text));

      return ends;
    }, []);
  },

  _markerBackgroundColorOf(kind: SelectionCellKind, activeMarker: TerminalSelectionMarkerName): string {
    if (kind === 'selected') {
      return constant.terminal.selection.bg;
    }
    if (kind === 'fromMarker' && activeMarker === 'from') {
      return constant.terminal.selection.fromActiveBg;
    }
    if (kind === 'fromMarker') {
      return constant.terminal.selection.fromBg;
    }
    if (activeMarker === 'to') {
      return constant.terminal.selection.toActiveBg;
    }

    return constant.terminal.selection.toBg;
  },

  _nonEmptySegments(segments: StyledSegment[]): StyledSegment[] {
    return segments.filter((segment) => {
      return segment.text.length > 0;
    });
  },

  _selectionPiecesOf(params: {
    columnStart: number;
    selection: TerminalRowSelection;
    segment: StyledSegment;
  }): TerminalRowPiece[] {
    const { columnStart, selection, segment } = params;
    // Grapheme spans, not per-code-unit columns: a wide emoji or a joined
    // cluster highlights as one unit.
    const cells = terminalUnicodeWidthUtil.toGraphemes(segment.text).map((grapheme) => {
      const fromColumn = columnStart + grapheme.column;
      return {
        fromColumn,
        kind: this._cellKindWithin(selection, fromColumn, fromColumn + grapheme.width - 1),
        text: segment.text.slice(grapheme.start, grapheme.end),
        toColumn: fromColumn + grapheme.width - 1,
      };
    });
    const runs = cells.reduce<SelectionRun[]>((runAccumulator, cell) => {
      const previous = runAccumulator[runAccumulator.length - 1];
      if (previous !== undefined && previous.kind === cell.kind) {
        previous.text += cell.text;

        return runAccumulator;
      }
      runAccumulator.push({ kind: cell.kind, text: cell.text });

      return runAccumulator;
    }, []);

    return runs.map((run) => {
      if (run.kind === null) {
        return { backgroundColor: null, segment: { ...segment, text: run.text } };
      }

      return {
        backgroundColor: this._markerBackgroundColorOf(run.kind, selection.activeMarker),
        segment: { ...segment, text: run.text },
      };
    });
  },

  _segmentsWithTrailingCursor(params: {
    cursorColumn: number;
    row: StyledRow;
    rowEndColumn: number;
  }): StyledSegment[] {
    const { cursorColumn, row, rowEndColumn } = params;
    const gapColumnCount = Math.max(0, cursorColumn - rowEndColumn);

    return [...row.segments, ...this._blankSegments({ columnCount: gapColumnCount }), EMPTY_CURSOR_SEGMENT];
  },

  _blankSegments(params: { columnCount: number }): StyledSegment[] {
    const { columnCount } = params;
    if (columnCount === 0) {
      return [];
    }

    return [{ bold: false, inverse: false, italic: false, text: ' '.repeat(columnCount), underline: false }];
  },

  _unitsWithin(params: { dividendPx: number; divisorPx: number }): number {
    const { dividendPx, divisorPx } = params;
    if (divisorPx <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(dividendPx / divisorPx));
  },
};
