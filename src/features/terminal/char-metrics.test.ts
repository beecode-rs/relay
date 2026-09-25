import { constant } from '@/constants/constant';
import { charMetrics } from '@/features/terminal/char-metrics';

const measurementOf = (overrides: Partial<Parameters<typeof charMetrics.gridSizeFromProbe>[0]> = {}) => {
  return {
    availableHeightPx: 432,
    availableWidthPx: 336,
    probeCharCount: constant.terminal.gridProbe.charCount,
    probeLineHeightPx: 18,
    probeWidthPx: 160,
    ...overrides,
  };
};

describe('charMetrics', () => {
  it('exposes a 20-character monospace probe text', () => {
    expect(constant.terminal.gridProbe.text).toBe('M'.repeat(20));
    expect(constant.terminal.gridProbe.charCount).toBe(20);
  });

  it('floors available size into whole columns and rows', () => {
    const grid = charMetrics.gridSizeFromProbe(measurementOf());
    expect(grid).toEqual({ cols: 42, rows: 24 });
  });

  it('computes cols from the per-character probe width', () => {
    const grid = charMetrics.gridSizeFromProbe(measurementOf({ availableWidthPx: 168, probeWidthPx: 160 }));
    expect(grid.cols).toBe(21);
  });

  it('clamps oversized grids to the maximums', () => {
    const grid = charMetrics.gridSizeFromProbe(
      measurementOf({ availableHeightPx: 100000, availableWidthPx: 100000 })
    );
    expect(grid).toEqual({ cols: constant.terminal.columns.max, rows: constant.terminal.rows.max });
  });

  it('clamps tiny grids to the minimums', () => {
    const grid = charMetrics.gridSizeFromProbe(measurementOf({ availableHeightPx: 8, availableWidthPx: 8 }));
    expect(grid).toEqual({ cols: constant.terminal.columns.min, rows: constant.terminal.rows.min });
  });

  it('returns the minimums when the probe measurement is unusable', () => {
    expect(charMetrics.gridSizeFromProbe(measurementOf({ probeWidthPx: 0 }))).toEqual({
      cols: constant.terminal.columns.min,
      rows: 24,
    });
    expect(
      charMetrics.gridSizeFromProbe(measurementOf({ probeCharCount: 0, probeWidthPx: 160 }))
    ).toEqual({ cols: constant.terminal.columns.min, rows: 24 });
    expect(charMetrics.gridSizeFromProbe(measurementOf({ probeLineHeightPx: 0 }))).toEqual({
      cols: 42,
      rows: constant.terminal.rows.min,
    });
    expect(charMetrics.gridSizeFromProbe(measurementOf({ probeLineHeightPx: Number.NaN }))).toEqual({
      cols: 42,
      rows: constant.terminal.rows.min,
    });
  });

  it('returns the minimums when the available size is not finite', () => {
    expect(charMetrics.gridSizeFromProbe(measurementOf({ availableWidthPx: Number.NaN }))).toEqual({
      cols: constant.terminal.columns.min,
      rows: 24,
    });
    expect(charMetrics.gridSizeFromProbe(measurementOf({ availableHeightPx: Number.POSITIVE_INFINITY }))).toEqual({
      cols: 42,
      rows: constant.terminal.rows.max,
    });
  });
});
