import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampSelection,
  extractSelectedText,
  lastWordRange,
  moveActiveMarker,
  selectionInDocument,
  wordRangeAt,
} from '@/features/terminal/terminal-selection';
import type {
  TerminalSelectionDocument,
  TerminalSelectionMarkerName,
  TerminalSelectionPosition,
  TerminalSelectionState,
} from '@/features/terminal/terminal-selection';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';

export type TerminalSelectionController = {
  accept(): void;
  cancel(): void;
  // The frozen copy the selection runs over once it loaded; null while the
  // selection still sits on the live snapshot.
  document: TerminalSelectionDocument | null;
  isAcceptable: boolean;
  moveActiveMarkerTo(position: TerminalSelectionPosition): void;
  selection: TerminalSelectionState | null;
  setActiveMarker(marker: TerminalSelectionMarkerName): void;
  startAtPosition(position: TerminalSelectionPosition): void;
  startFromLastWord(): void;
  switchActiveMarker(): void;
};

export function useTerminalSelection(params: {
  // Loads a scrollable copy of what the live screen shows plus the content
  // around it (tmux history), so a selection can outgrow the screen. Resolving
  // null keeps the selection on the live snapshot.
  loadDocument?(): Promise<TerminalSelectionDocument | null>;
  onCopyText(text: string): Promise<void> | void;
  snapshot: TerminalSnapshot;
}): TerminalSelectionController {
  const { loadDocument, onCopyText, snapshot } = params;
  const [selection, setSelection] = useState<TerminalSelectionState | null>(null);
  const [selectionDocument, setSelectionDocument] = useState<TerminalSelectionDocument | null>(null);
  const activeSnapshot = selectionDocument?.snapshot ?? snapshot;
  const snapshotRef = useRef(activeSnapshot);
  const selectionRef = useRef(selection);
  const onCopyTextRef = useRef(onCopyText);
  const loadDocumentRef = useRef(loadDocument);
  const documentRequestIdRef = useRef(0);
  const previousAlternateRef = useRef(snapshot.isAlternateBuffer);

  useEffect(() => {
    snapshotRef.current = activeSnapshot;
  }, [activeSnapshot]);

  useEffect(() => {
    loadDocumentRef.current = loadDocument;
  }, [loadDocument]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    onCopyTextRef.current = onCopyText;
  }, [onCopyText]);

  // Ends the selection and invalidates any document still loading for it.
  const clearSelection = useCallback(() => {
    documentRequestIdRef.current += 1;
    setSelectionDocument(null);
    setSelection(null);
  }, []);

  // The selection starts on the live screen at once; the document swaps in
  // when it lands, carrying the markers over to the same on-screen cells.
  const requestDocument = useCallback(() => {
    documentRequestIdRef.current += 1;
    const requestId = documentRequestIdRef.current;
    const load = loadDocumentRef.current;
    if (load === undefined) {
      return;
    }
    const liveSnapshot = snapshotRef.current;
    void load()
      .then((loadedDocument) => {
        if (loadedDocument === null || requestId !== documentRequestIdRef.current) {
          return;
        }
        setSelection((previous) => {
          if (previous === null) {
            return previous;
          }
          return selectionInDocument(previous, { document: loadedDocument, liveSnapshot });
        });
        setSelectionDocument(loadedDocument);
      })
      .catch(() => {
        return;
      });
  }, []);

  const startFromLastWord = useCallback(() => {
    const currentSnapshot = snapshotRef.current;
    const range = lastWordRange(currentSnapshot);
    if (range === null) {
      const line = currentSnapshot.firstLine + Math.max(currentSnapshot.rows.length - 1, 0);
      setSelection({ activeMarker: 'from', from: { col: 0, line }, to: { col: 0, line } });
    } else {
      setSelection({ activeMarker: 'from', from: range.start, to: range.end });
    }
    requestDocument();
  }, [requestDocument]);

  const startAtPosition = useCallback(
    (position: TerminalSelectionPosition) => {
      const range = wordRangeAt(snapshotRef.current, position);
      setSelection({ activeMarker: 'to', from: range.start, to: range.end });
      requestDocument();
    },
    [requestDocument]
  );

  const cancel = clearSelection;

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
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    if (previousAlternateRef.current === snapshot.isAlternateBuffer) {
      return;
    }
    previousAlternateRef.current = snapshot.isAlternateBuffer;
    clearSelection();
  }, [clearSelection, snapshot.isAlternateBuffer]);

  const clampedSelection = selection === null ? null : clampSelection(selection, activeSnapshot);
  const isAcceptable =
    clampedSelection !== null &&
    extractSelectedText(activeSnapshot, clampedSelection).trim().length > 0;

  return {
    accept,
    cancel,
    document: selectionDocument,
    isAcceptable,
    moveActiveMarkerTo,
    selection: clampedSelection,
    setActiveMarker,
    startAtPosition,
    startFromLastWord,
    switchActiveMarker,
  };
}
