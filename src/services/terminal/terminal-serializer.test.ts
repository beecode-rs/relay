import { Terminal } from '@xterm/headless';

import { createScrollbackCache, serializeTerminal } from '@/services/terminal/terminal-serializer';

const createWrittenTerminal = async (data: string, size?: { cols: number; rows: number }): Promise<Terminal> => {
  const terminal = new Terminal({
    allowProposedApi: true,
    cols: size?.cols ?? 80,
    rows: size?.rows ?? 24,
    scrollback: 1000,
  });
  await new Promise<void>((resolve) => {
    terminal.write(data, () => {
      resolve();
    });
  });
  return terminal;
};

const writeMore = async (terminal: Terminal, data: string): Promise<void> => {
  await new Promise<void>((resolve) => {
    terminal.write(data, () => {
      resolve();
    });
  });
};

describe('serializeTerminal', () => {
  it('splits rows into default and colored segments', async () => {
    const terminal = await createWrittenTerminal('\r\nhello \x1b[31mred\x1b[0m!');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([]);
    expect(snapshot.rows[1]?.segments).toEqual([
      { text: 'hello ', bold: false, underline: false, inverse: false },
      { text: 'red', fgColor: 1, bold: false, underline: false, inverse: false },
      { text: '!', bold: false, underline: false, inverse: false },
    ]);
    expect(snapshot.cursor).toEqual({ x: 10, y: 1 });
  });

  it('reports a forced cursor position from CUP', async () => {
    const terminal = await createWrittenTerminal('abc\x1b[2;5H');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('abc');
    expect(snapshot.cursor).toEqual({ x: 4, y: 1 });
  });

  it('carries bold, underline and inverse flags on segments', async () => {
    const terminal = await createWrittenTerminal('\x1b[1mbold\x1b[22m\x1b[4munder\x1b[24m\x1b[7minv\x1b[27m');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: 'bold', bold: true, underline: false, inverse: false },
      { text: 'under', bold: false, underline: true, inverse: false },
      { text: 'inv', bold: false, underline: false, inverse: true },
    ]);
  });

  it('carries background colors as palette indices', async () => {
    const terminal = await createWrittenTerminal('\x1b[41mwarn\x1b[49m');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: 'warn', bgColor: 1, bold: false, underline: false, inverse: false },
    ]);
  });

  it('maps true-color foregrounds to the nearest palette index', async () => {
    const terminal = await createWrittenTerminal('\x1b[38;2;255;0;0mtrue\x1b[0m');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: 'true', fgColor: 9, bold: false, underline: false, inverse: false },
    ]);
  });

  it('serializes box-drawing characters as plain text', async () => {
    const terminal = await createWrittenTerminal('┌─┐│');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: '┌─┐│', bold: false, underline: false, inverse: false },
    ]);
  });

  it('substitutes glyphs the terminal font cannot render', async () => {
    const terminal = await createWrittenTerminal('⏵⏵ bypass permissions on ✓');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: '▸▸ bypass permissions on √', bold: false, underline: false, inverse: false },
    ]);
  });

  it('appends wide characters once without a continuation gap', async () => {
    const terminal = await createWrittenTerminal('a你b');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: 'a你b', bold: false, underline: false, inverse: false },
    ]);
    expect(snapshot.cursor).toEqual({ x: 4, y: 0 });
  });

  it('drops trailing blank cells but keeps interior blanks', async () => {
    const terminal = await createWrittenTerminal('ab  cd  ');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: 'ab  cd', bold: false, underline: false, inverse: false },
    ]);
  });

  it('keeps styled blank cells at the end of a row', async () => {
    const terminal = await createWrittenTerminal('x\x1b[7m \x1b[27m');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows[0]?.segments).toEqual([
      { text: 'x', bold: false, underline: false, inverse: false },
      { text: ' ', bold: false, underline: false, inverse: true },
    ]);
  });

  it('serializes scrollback history above the live viewport', async () => {
    const terminal = await createWrittenTerminal('one\r\ntwo\r\nthree', { cols: 80, rows: 2 });
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows).toHaveLength(3);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('one');
    expect(snapshot.rows[1]?.segments[0]?.text).toBe('two');
    expect(snapshot.rows[2]?.segments[0]?.text).toBe('three');
    expect(snapshot.cursor).toEqual({ x: 5, y: 2 });
    expect(snapshot.firstLine).toBe(0);
  });

  it('appends newly scrolled rows to a reused cache without re-anchoring history', async () => {
    const terminal = await createWrittenTerminal('one\r\ntwo\r\nthree', { cols: 80, rows: 2 });
    const cache = createScrollbackCache();
    const initialSnapshot = serializeTerminal(terminal, cache);
    expect(initialSnapshot.rows[0]?.segments[0]?.text).toBe('one');
    await writeMore(terminal, '\r\nfour\r\n');
    const updatedSnapshot = serializeTerminal(terminal, cache);
    expect(updatedSnapshot.rows).toHaveLength(5);
    expect(updatedSnapshot.rows[0]?.segments[0]?.text).toBe('one');
    expect(updatedSnapshot.rows[2]?.segments[0]?.text).toBe('three');
    expect(updatedSnapshot.rows[3]?.segments[0]?.text).toBe('four');
    expect(updatedSnapshot.cursor).toEqual({ x: 0, y: 4 });
    expect(updatedSnapshot.firstLine).toBe(0);
  });

  it('rebuilds the cache after the scrollback is erased', async () => {
    const terminal = await createWrittenTerminal('one\r\ntwo\r\nthree', { cols: 80, rows: 2 });
    const cache = createScrollbackCache();
    serializeTerminal(terminal, cache);
    await writeMore(terminal, '\x1b[3J');
    const snapshot = serializeTerminal(terminal, cache);
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('two');
    expect(snapshot.rows[1]?.segments[0]?.text).toBe('three');
  });

  it('appends via scroll events while pinned at the scrollback cap', async () => {
    const lineCount = 1004;
    const terminal = new Terminal({ allowProposedApi: true, cols: 80, rows: 2, scrollback: 1000 });
    const lines = Array.from({ length: lineCount }, (_value, index) => {
      return `m${String(index).padStart(4, '0')}`;
    });
    await new Promise<void>((resolve) => {
      terminal.write(`${lines.join('\r\n')}\r\n`, () => {
        resolve();
      });
    });
    const cache = createScrollbackCache();
    const cappedSnapshot = serializeTerminal(terminal, cache);
    expect(cappedSnapshot.rows).toHaveLength(1002);
    cache.scrollEventCount += 1;
    await writeMore(terminal, '\r\nm-new');
    const shiftedSnapshot = serializeTerminal(terminal, cache);
    expect(shiftedSnapshot.rows).toHaveLength(1002);
    expect(shiftedSnapshot.firstLine).toBe(cappedSnapshot.firstLine + 1);
    expect(shiftedSnapshot.rows[0]?.segments[0]?.text).toBe(cappedSnapshot.rows[1]?.segments[0]?.text);
    expect(shiftedSnapshot.rows[1001]?.segments[0]?.text).toBe('m-new');
  });

  it('excludes scrollback while the alternate buffer is active', async () => {
    const terminal = await createWrittenTerminal('one\r\ntwo\r\nthree', { cols: 80, rows: 2 });
    await writeMore(terminal, '\x1b[?1049h\x1b[Hvimalt');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('vimalt');
    expect(snapshot.cursor.y).toBe(0);
    expect(snapshot.isAlternateBuffer).toBe(true);
    expect(snapshot.viewportRowCount).toBe(2);
  });

  it('marks the normal buffer snapshots as not alternate', async () => {
    const terminal = await createWrittenTerminal('plain');
    const snapshot = serializeTerminal(terminal);
    expect(snapshot.isAlternateBuffer).toBe(false);
    expect(snapshot.viewportRowCount).toBe(24);
  });
});
