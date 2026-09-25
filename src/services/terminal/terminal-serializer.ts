import type { IBuffer, IBufferCell, IBufferLine, Terminal } from '@xterm/headless';
import { terminalPaletteUtil } from '@/services/terminal/terminal-palette';

export type StyledSegment = {
  text: string;
  fgColor?: number;
  bgColor?: number;
  bold: boolean;
  underline: boolean;
  inverse: boolean;
};

export type StyledRow = { segments: StyledSegment[] };

export type TerminalSnapshot = {
  rows: StyledRow[];
  cursor: { x: number; y: number };
  firstLine: number;
  isAlternateBuffer: boolean;
  viewportRowCount: number;
};

export type ScrollbackCache = {
  baseY: number;
  bufferLength: number;
  cols: number;
  firstLine: number;
  scrollEventCount: number;
  scrollbackRows: StyledRow[];
  syncedEventCount: number;
};

const MAX_SCROLLBACK_ROWS = 1000;

export const createScrollbackCache = (): ScrollbackCache => {
  return {
    baseY: 0,
    bufferLength: 0,
    cols: 0,
    firstLine: 0,
    scrollEventCount: 0,
    scrollbackRows: [],
    syncedEventCount: 0,
  };
};

type CellStyle = Omit<StyledSegment, 'text'>;

const hexChannelOf = (hex: string, offset: number): number => {
  return parseInt(hex.slice(offset, offset + 2), 16);
};

const nearestPaletteIndex = (rgb: number): number => {
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;
  return Array.from({ length: 256 }, (_value, index) => {
    const hex = terminalPaletteUtil.colorAt({ index });
    const redDelta = red - hexChannelOf(hex, 1);
    const greenDelta = green - hexChannelOf(hex, 3);
    const blueDelta = blue - hexChannelOf(hex, 5);
    return { distance: redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta, index };
  }).reduce((best, candidate) => {
    if (candidate.distance < best.distance) {
      return candidate;
    }
    return best;
  }).index;
};

const fgColorOf = (cell: IBufferCell): number | undefined => {
  if (cell.isFgDefault()) {
    return undefined;
  }
  if (cell.isFgPalette()) {
    return cell.getFgColor();
  }
  if (cell.isFgRGB()) {
    return nearestPaletteIndex(cell.getFgColor());
  }
  return undefined;
};

const bgColorOf = (cell: IBufferCell): number | undefined => {
  if (cell.isBgDefault()) {
    return undefined;
  }
  if (cell.isBgPalette()) {
    return cell.getBgColor();
  }
  if (cell.isBgRGB()) {
    return nearestPaletteIndex(cell.getBgColor());
  }
  return undefined;
};

const isCellStyled = (cell: IBufferCell): boolean => {
  return (
    !cell.isFgDefault() ||
    !cell.isBgDefault() ||
    cell.isBold() !== 0 ||
    cell.isDim() !== 0 ||
    cell.isItalic() !== 0 ||
    cell.isUnderline() !== 0 ||
    cell.isBlink() !== 0 ||
    cell.isInverse() !== 0 ||
    cell.isInvisible() !== 0 ||
    cell.isStrikethrough() !== 0 ||
    cell.isOverline() !== 0
  );
};

const styleOfCell = (cell: IBufferCell): CellStyle => {
  return {
    fgColor: fgColorOf(cell),
    bgColor: bgColorOf(cell),
    bold: cell.isBold() !== 0,
    underline: cell.isUnderline() !== 0,
    inverse: cell.isInverse() !== 0,
  };
};

const isSameStyle = (segment: StyledSegment, style: CellStyle): boolean => {
  return (
    segment.fgColor === style.fgColor &&
    segment.bgColor === style.bgColor &&
    segment.bold === style.bold &&
    segment.underline === style.underline &&
    segment.inverse === style.inverse
  );
};

const lastSignificantColumn = (line: IBufferLine, cols: number): number => {
  const cells = Array.from({ length: cols }, (_value, x) => {
    return line.getCell(x);
  });
  return cells.reduce((lastSignificant, cell, x) => {
    if (cell === undefined || cell.getWidth() === 0) {
      return lastSignificant;
    }
    const chars = cell.getChars();
    const hasVisibleText = chars.trim().length > 0;
    if (hasVisibleText || isCellStyled(cell)) {
      return x;
    }
    return lastSignificant;
  }, -1);
};

const serializeRow = (line: IBufferLine | undefined, cols: number): StyledRow => {
  if (line === undefined) {
    return { segments: [] };
  }
  const lastColumn = lastSignificantColumn(line, cols);
  if (lastColumn === -1) {
    return { segments: [] };
  }
  const cells = Array.from({ length: lastColumn + 1 }, (_value, x) => {
    return line.getCell(x);
  });
  const segments = cells.reduce<StyledSegment[]>((accumulated, cell) => {
    if (cell === undefined || cell.getWidth() === 0) {
      return accumulated;
    }
    const chars = cell.getChars();
    const text = chars.length === 0 ? ' ' : chars;
    const style = styleOfCell(cell);
    const previous = accumulated[accumulated.length - 1];
    if (previous !== undefined && isSameStyle(previous, style)) {
      previous.text += text;
      return accumulated;
    }
    accumulated.push({ text, ...style });
    return accumulated;
  }, []);
  return { segments };
};

const serializeRowRange = (buffer: IBuffer, cols: number, fromLine: number, toLine: number): StyledRow[] => {
  return Array.from({ length: Math.max(0, toLine - fromLine) }, (_value, index) => {
    return serializeRow(buffer.getLine(fromLine + index), cols);
  });
};

const serializeViewportSnapshot = (terminal: Terminal): TerminalSnapshot => {
  const buffer = terminal.buffer.active;
  const rows = serializeRowRange(buffer, terminal.cols, buffer.baseY, buffer.baseY + terminal.rows);
  return {
    rows,
    cursor: { x: buffer.cursorX, y: buffer.cursorY },
    firstLine: 0,
    isAlternateBuffer: true,
    viewportRowCount: terminal.rows,
  };
};

const isCacheInvalid = (cache: ScrollbackCache, terminal: Terminal): boolean => {
  const buffer = terminal.buffer.active;
  return cache.cols !== terminal.cols || buffer.baseY < cache.baseY || buffer.length < cache.bufferLength;
};

const syncCacheMarkers = (cache: ScrollbackCache, terminal: Terminal): void => {
  const buffer = terminal.buffer.active;
  cache.baseY = buffer.baseY;
  cache.bufferLength = buffer.length;
  cache.cols = terminal.cols;
  cache.syncedEventCount = cache.scrollEventCount;
};

const rebuildScrollbackCache = (cache: ScrollbackCache, terminal: Terminal): void => {
  const buffer = terminal.buffer.active;
  const fromLine = Math.max(0, buffer.baseY - MAX_SCROLLBACK_ROWS);
  cache.firstLine = fromLine;
  cache.scrollbackRows = serializeRowRange(buffer, terminal.cols, fromLine, buffer.baseY);
  syncCacheMarkers(cache, terminal);
};

const appendScrolledRowsToCache = (cache: ScrollbackCache, terminal: Terminal, scrollGrowth: number): void => {
  const buffer = terminal.buffer.active;
  const fromLine = Math.max(0, buffer.baseY - Math.min(scrollGrowth, MAX_SCROLLBACK_ROWS));
  const scrolledRows = serializeRowRange(buffer, terminal.cols, fromLine, buffer.baseY);
  const combinedRows = [...cache.scrollbackRows, ...scrolledRows];
  const trimCount = Math.max(0, combinedRows.length - MAX_SCROLLBACK_ROWS);
  cache.firstLine += trimCount;
  cache.scrollbackRows = trimCount === 0 ? combinedRows : combinedRows.slice(trimCount);
  syncCacheMarkers(cache, terminal);
};

const updateScrollbackCache = (cache: ScrollbackCache, terminal: Terminal): void => {
  if (isCacheInvalid(cache, terminal)) {
    rebuildScrollbackCache(cache, terminal);
    return;
  }
  const baseYGrowth = terminal.buffer.active.baseY - cache.baseY;
  const eventGrowth = cache.scrollEventCount - cache.syncedEventCount;
  const scrollGrowth = Math.max(baseYGrowth, eventGrowth);
  if (scrollGrowth > 0) {
    appendScrolledRowsToCache(cache, terminal, scrollGrowth);
    return;
  }
  syncCacheMarkers(cache, terminal);
};

export const serializeTerminal = (terminal: Terminal, cache?: ScrollbackCache): TerminalSnapshot => {
  const buffer = terminal.buffer.active;
  if (buffer.type === 'alternate') {
    return serializeViewportSnapshot(terminal);
  }
  const activeCache = cache ?? createScrollbackCache();
  updateScrollbackCache(activeCache, terminal);
  const viewportRows = serializeRowRange(buffer, terminal.cols, buffer.baseY, buffer.baseY + terminal.rows);
  return {
    rows: [...activeCache.scrollbackRows, ...viewportRows],
    cursor: { x: buffer.cursorX, y: activeCache.scrollbackRows.length + buffer.cursorY },
    firstLine: activeCache.firstLine,
    isAlternateBuffer: false,
    viewportRowCount: terminal.rows,
  };
};
