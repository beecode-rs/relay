import { constant } from '@/constants/constant';

export type TerminalGridSize = { cols: number; rows: number };

export type ProbeMeasurement = {
  availableHeightPx: number;
  availableWidthPx: number;
  probeCharCount: number;
  probeLineHeightPx: number;
  probeWidthPx: number;
};

const dimensionFrom = (params: {
  availablePx: number;
  min: number;
  max: number;
  unitPx: number;
}): number => {
  const isUnitUsable = Number.isFinite(params.unitPx) && params.unitPx > 0;
  if (!isUnitUsable || Number.isNaN(params.availablePx)) {
    return params.min;
  }
  return Math.min(params.max, Math.max(params.min, Math.floor(params.availablePx / params.unitPx)));
};

export const charMetrics = {
  gridSizeFromProbe(measurement: ProbeMeasurement): TerminalGridSize {
    const charWidthPx = measurement.probeWidthPx / measurement.probeCharCount;
    return {
      cols: dimensionFrom({
        availablePx: measurement.availableWidthPx,
        max: constant.terminal.columns.max,
        min: constant.terminal.columns.min,
        unitPx: charWidthPx,
      }),
      rows: dimensionFrom({
        availablePx: measurement.availableHeightPx,
        max: constant.terminal.rows.max,
        min: constant.terminal.rows.min,
        unitPx: measurement.probeLineHeightPx,
      }),
    };
  },
};
