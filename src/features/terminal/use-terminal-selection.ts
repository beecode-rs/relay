import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampSelection,
  extractSelectedText,
  lastWordRange,
  moveActiveMarker,
  wordRangeAt,
} from '@/features/terminal/terminal-selection';
import type {
  TerminalSelectionMarkerName,
  TerminalSelectionPosition,
  TerminalSelectionState,
} from '@/features/terminal/terminal-selection';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';

export type TerminalSelectionController = {
  accept(): void;
  cancel(): void;
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
      return moveActiveMarker(clampSelection(previous, snapshotRef.current), position);
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

  const accept = useCallback(() => {
    const current = selectionRef.current;
    if (current === null) {
      return;
    }
    const text = extractSelectedText(
      snapshotRef.current,
      clampSelection(current, snapshotRef.current)
    );
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
    setSelection(null);
  }, [snapshot.isAlternateBuffer]);

  const clampedSelection = selection === null ? null : clampSelection(selection, snapshot);
  const isAcceptable =
    clampedSelection !== null &&
    extractSelectedText(snapshot, clampedSelection).trim().length > 0;

  return {
    accept,
    cancel,
    isAcceptable,
    moveActiveMarkerTo,
    selection: clampedSelection,
    setActiveMarker,
    startAtPosition,
    startFromLastWord,
    switchActiveMarker,
  };
}
