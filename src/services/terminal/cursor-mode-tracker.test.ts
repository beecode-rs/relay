import { CursorModeTracker } from '@/services/terminal/cursor-mode-tracker';

describe('CursorModeTracker', () => {
  it('starts in normal cursor key mode', () => {
    expect(new CursorModeTracker().isApplicationCursorKeys).toBe(false);
  });

  it('detects DECCKM set and reset', () => {
    const tracker = new CursorModeTracker();
    tracker.update('\x1b[?1h');
    expect(tracker.isApplicationCursorKeys).toBe(true);
    tracker.update('\x1b[?1l');
    expect(tracker.isApplicationCursorKeys).toBe(false);
  });

  it('detects DECCKM inside combined parameter lists', () => {
    const tracker = new CursorModeTracker();
    tracker.update('\x1b[?1;3h');
    expect(tracker.isApplicationCursorKeys).toBe(true);
    tracker.update('\x1b[?25;1l');
    expect(tracker.isApplicationCursorKeys).toBe(false);
  });

  it('ignores other DEC private modes', () => {
    const tracker = new CursorModeTracker();
    tracker.update('\x1b[?12h\x1b[?25l\x1b[?47h');
    expect(tracker.isApplicationCursorKeys).toBe(false);
    tracker.update('\x1b[?1000h');
    expect(tracker.isApplicationCursorKeys).toBe(false);
  });

  it('survives sequences split across chunks', () => {
    const tracker = new CursorModeTracker();
    tracker.update('\x1b[?1');
    tracker.update('h');
    expect(tracker.isApplicationCursorKeys).toBe(true);

    const resetTracker = new CursorModeTracker();
    resetTracker.update('\x1b[?1h');
    resetTracker.update('\x1b[?');
    resetTracker.update('1l');
    expect(resetTracker.isApplicationCursorKeys).toBe(false);
  });

  it('tracks the last mode when a chunk carries both set and reset', () => {
    const tracker = new CursorModeTracker();
    tracker.update('\x1b[?1h\x1b[?1l');
    expect(tracker.isApplicationCursorKeys).toBe(false);
    tracker.update('\x1b[?1l\x1b[?1h');
    expect(tracker.isApplicationCursorKeys).toBe(true);
  });

  it('resets back to normal mode and clears any fragment', () => {
    const tracker = new CursorModeTracker();
    tracker.update('\x1b[?1h');
    tracker.reset();
    expect(tracker.isApplicationCursorKeys).toBe(false);
    tracker.update('h');
    expect(tracker.isApplicationCursorKeys).toBe(false);
  });
});
