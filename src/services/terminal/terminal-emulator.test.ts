import { createTerminalEmulator } from '@/services/terminal/terminal-emulator';
import type { TerminalEmulator } from '@/services/terminal/terminal-emulator';

const writeAndProcess = async (emulator: TerminalEmulator, data: string): Promise<void> => {
  await new Promise<void>((resolve) => {
    emulator.write(data, () => {
      resolve();
    });
  });
};

describe('createTerminalEmulator', () => {
  it('starts at the requested dimensions', () => {
    const emulator = createTerminalEmulator({ cols: 100, rows: 30 });
    expect(emulator.cols).toBe(100);
    expect(emulator.rows).toBe(30);
    expect(emulator.snapshotRows().rows).toHaveLength(30);
  });

  it('parses written output into the serialized buffer', async () => {
    const emulator = createTerminalEmulator({ cols: 80, rows: 24 });
    await writeAndProcess(emulator, 'hi');
    const snapshot = emulator.snapshotRows();
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('hi');
    expect(snapshot.cursor).toEqual({ x: 2, y: 0 });
  });

  it('resizes the viewport and reports the new dimensions', async () => {
    const emulator = createTerminalEmulator({ cols: 80, rows: 24 });
    await writeAndProcess(emulator, 'wide');
    emulator.resize(120, 40);
    expect(emulator.cols).toBe(120);
    expect(emulator.rows).toBe(40);
    const snapshot = emulator.snapshotRows();
    expect(snapshot.rows).toHaveLength(40);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('wide');
  });

  it('resets the buffer content', async () => {
    const emulator = createTerminalEmulator({ cols: 80, rows: 24 });
    await writeAndProcess(emulator, 'goodbye');
    emulator.reset();
    const snapshot = emulator.snapshotRows();
    expect(snapshot.rows[0]?.segments).toEqual([]);
    expect(snapshot.cursor).toEqual({ x: 0, y: 0 });
  });

  it('keeps scrollback beyond the viewport', async () => {
    const emulator = createTerminalEmulator({ cols: 80, rows: 2 });
    await writeAndProcess(emulator, 'one\r\ntwo\r\nthree');
    const snapshot = emulator.snapshotRows();
    expect(snapshot.rows).toHaveLength(3);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('one');
    expect(snapshot.rows[2]?.segments[0]?.text).toBe('three');
  });

  it('retains a bounded history while streaming past the scrollback cap', async () => {
    const emulator = createTerminalEmulator({ cols: 80, rows: 30 });
    const chunkCount = 40;
    await Array.from({ length: chunkCount }).reduce(async (previous, _element, chunk) => {
      await previous;
      const lines = Array.from({ length: 50 }, (_value, index) => {
        return `chunk-${chunk}-line-${index}`;
      });
      await writeAndProcess(emulator, `${lines.join('\r\n')}\r\n`);
      emulator.snapshotRows();
    }, Promise.resolve());
    const snapshot = emulator.snapshotRows();
    expect(snapshot.rows).toHaveLength(1030);
    expect(snapshot.rows[0]?.segments[0]?.text).toBe('chunk-19-line-21');
    expect(snapshot.rows[1029]?.segments[0]?.text).toBeUndefined();
    expect(snapshot.firstLine).toBeGreaterThan(0);
  });
});
