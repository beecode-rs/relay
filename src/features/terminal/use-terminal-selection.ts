import { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyViewportShift,
  clampPosition,
  clampSelectionOverflowing,
  extractSelectedText,
  lastWordRange,
  moveActiveMarker,
  renderableSelectionOf,
  rowTextOf,
  withoutOverflowForMovedMarker,
  wordRangeAt,
} from '@/features/terminal/terminal-selection';
import type {
  TerminalSelectionMarkerName,
  TerminalSelectionPosition,
  TerminalSelectionState,
} from '@/features/terminal/terminal-selection';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';

const MAX_PENDING_SHIFT_ROWS = 64;

const rowsChangedBetween = (previous: TerminalSnapshot, current: TerminalSnapshot): boolean => {
  if (previous.rows.length !== current.rows.length) {
    return true;
  }
  return previous.rows.some((row, index) => {
    return rowTextOf(row) !== rowTextOf(current.rows[index]);
  });
};

export type TerminalSelectionController = {
  accept(): void;
  cancel(): void;
  expectViewportShift(rows: number): void;
  isAcceptable: boolean;
  moveActiveMarkerTo(position: TerminalSelectionPosition): void;
  selection: TerminalSelectionState | null;
  setActiveMarker(marker: TerminalSelectionMarkerName): void;
  startAtPosition(position: TerminalSelectionPosition): void;
  startFromLastWord(): void;
  switchActiveMarker(): void;
};

export function useTerminalSelection(params: {
  onCopyText(text: string): Promise<void> | void;
  snapshot: TerminalSnapshot;
}): TerminalSelectionController {
  const { onCopyText, snapshot } = params;
  const [selection, setSelection] = useState<TerminalSelectionState | null>(null);
  const snapshotRef = useRef(snapshot);
  const selectionRef = useRef(selection);
  const onCopyTextRef = useRef(onCopyText);
  const previousAlternateRef = useRef(snapshot.isAlternateBuffer);
  const previousSnapshotRef = useRef<TerminalSnapshot | null>(null);
  const pendingShiftRowsRef = useRef(0);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    onCopyTextRef.current = onCopyText;
  }, [onCopyText]);

  const startFromLastWord = useCallback(() => {
    const currentSnapshot = snapshotRef.current;
    const range = lastWordRange(currentSnapshot);
    if (range === null) {
      const line = currentSnapshot.firstLine + Math.max(currentSnapshot.rows.length - 1, 0);
      setSelection({ activeMarker: 'from', from: { col: 0, line }, to: { col: 0, line } });
      return;
    }
    setSelection({ activeMarker: 'from', from: range.start, to: range.end });
  }, []);

  const startAtPosition = useCallback((position: TerminalSelectionPosition) => {
    const range = wordRangeAt(snapshotRef.current, position);
    setSelection({ activeMarker: 'to', from: range.start, to: range.end });
  }, []);

  const cancel = useCallback(() => {
    pendingShiftRowsRef.current = 0;
    setSelection(null);
  }, []);

  const setActiveMarker = useCallback((marker: TerminalSelectionMarkerName) => {
    setSelection((previous) => {
      if (previous === null) {
        return previous;
      }
      return { ...previous, activeMarker: marker };
    });
  }, []);

  const moveActiveMarkerTo = useCallback((position: TerminalSelectionPosition) => {
    setSelection((previous) => {
      if (previous === null) {
        return previous;
      }
      const clamped = clampSelectionOverflowing(previous, snapshotRef.current);
      const moved = moveActiveMarker(clamped, clampPosition(position, snapshotRef.current));
      return withoutOverflowForMovedMarker(moved);
    });
  }, []);

  const switchActiveMarker = useCallback(() => {
    setSelection((previous) => {
      if (previous === null) {
        return previous;
      }
      const activeMarker = previous.activeMarker === 'from' ? 'to' : 'from';
      return { ...previous, activeMarker };
    });
  }, []);

  // Registers the content shift a commanded remote scroll will repaint: rows >
  // 0 mean the viewport content moves DOWN that many lines (tmux scroll-up).
  // The shift is applied once the snapshot first changes after the command,
  // which is the repaint landing; an unchanged snapshot keeps it waiting.
  const expectViewportShift = useCallback((rows: number) => {
    if (rows === 0) {
      return;
    }
    pendingShiftRowsRef.current = Math.max(
      -MAX_PENDING_SHIFT_ROWS,
      Math.min(MAX_PENDING_SHIFT_ROWS, pendingShiftRowsRef.current + rows)
    );
  }, []);

  const accept = useCallback(() => {
    const current = selectionRef.current;
    if (current === null) {
      return;
    }
    const text = extractSelectedText(snapshotRef.current, current);
    if (text.trim().length === 0) {
      return;
    }
    void Promise.resolve(onCopyTextRef.current(text)).catch(() => {
      return;
    });
    setSelection(null);
  }, []);

  useEffect(() => {
    if (previousAlternateRef.current === snapshot.isAlternateBuffer) {
      return;
    }
    previousAlternateRef.current = snapshot.isAlternateBuffer;
    pendingShiftRowsRef.current = 0;
    setSelection(null);
  }, [snapshot.isAlternateBuffer]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    previousSnapshotRef.current = snapshot;
    if (previousSnapshot === null || pendingShiftRowsRef.current === 0) {
      return;
    }
    if (!rowsChangedBetween(previousSnapshot, snapshot)) {
      return;
    }
    const current = selectionRef.current;
    const rows = pendingShiftRowsRef.current;
    pendingShiftRowsRef.current = 0;
    if (current === null) {
      return;
    }
    setSelection(
      applyViewportShift(current, { previousSnapshot, rows, snapshot })
    );
  }, [snapshot]);

  const clampedSelection = selection === null ? null : renderableSelectionOf(selection, snapshot);
  const isAcceptable =
    clampedSelection !== null &&
    extractSelectedText(snapshot, clampedSelection).trim().length > 0;

  return {
    accept,
    cancel,
    expectViewportShift,
    isAcceptable,
    moveActiveMarkerTo,
    selection: clampedSelection,
    setActiveMarker,
    startAtPosition,
    startFromLastWord,
    switchActiveMarker,
  };
}
