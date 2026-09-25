import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  GestureResponderEvent,
  GestureResponderHandlers,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  TextStyle,
} from 'react-native';

import { constant } from '@/constants/constant';

import { rowSelectionOf, rowTextOf } from '@/features/terminal/terminal-selection';
import type {
  TerminalSelectionPosition,
  TerminalSelectionState,
  TerminalRowSelection,
} from '@/features/terminal/terminal-selection';
import { terminalViewUtil } from '@/features/terminal/terminal-view-util';
import { terminalPaletteUtil } from '@/services/terminal/terminal-palette';
import type { TerminalRowPiece } from '@/features/terminal/terminal-view-util';
import type { StyledRow, StyledSegment, TerminalSnapshot } from '@/services/terminal/terminal-serializer';

export type TerminalFontProps = {
  boldFontFamily: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

export type TerminalSelectionMoveMode = 'follow' | 'relative';

export type TerminalViewProps = TerminalFontProps & {
  charWidthPx?: number;
  followRequestCount?: number;
  isCursorVisible: boolean;
  isRemoteScrollEnabled?: boolean;
  onPress?(): void;
  onScrollRows?(params: { rows: number }): void;
  onSelectionLongPress?(position: TerminalSelectionPosition): void;
  onSelectionMarkerSwitch?(): void;
  onSelectionMove?(position: TerminalSelectionPosition): void;
  onSurfaceLayout?(size: { heightPx: number; widthPx: number }): void;
  selection?: TerminalSelectionState | null;
  selectionMoveMode?: TerminalSelectionMoveMode;
  snapshot: TerminalSnapshot;
};

type TerminalRowProps = TerminalFontProps & {
  cursorColumn: number | null;
  row: StyledRow;
  selection: TerminalRowSelection | null;
};

const segmentStyleOf = (segment: StyledSegment, font: TerminalFontProps): TextStyle => {
  const foreground = segment.fgColor !== undefined ? terminalPaletteUtil.colorAt({ index: segment.fgColor }) : constant.terminal.fg;
  const background = segment.bgColor !== undefined ? terminalPaletteUtil.colorAt({ index: segment.bgColor }) : constant.terminal.bg;
  return {
    backgroundColor: segment.inverse ? foreground : background,
    color: segment.inverse ? background : foreground,
    fontFamily: segment.bold ? font.boldFontFamily : font.fontFamily,
    fontWeight: segment.bold ? '700' : undefined,
    textDecorationLine: segment.underline ? 'underline' : 'none',
  };
};

const isSameSegment = (a: StyledSegment, b: StyledSegment): boolean => {
  return (
    a.text === b.text &&
    a.fgColor === b.fgColor &&
    a.bgColor === b.bgColor &&
    a.bold === b.bold &&
    a.underline === b.underline &&
    a.inverse === b.inverse
  );
};

const isSameRowSelection = (a: TerminalRowSelection | null, b: TerminalRowSelection | null): boolean => {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return (
    a.activeMarker === b.activeMarker &&
    a.startColumn === b.startColumn &&
    a.endColumn === b.endColumn &&
    a.fromMarkerColumn === b.fromMarkerColumn &&
    a.toMarkerColumn === b.toMarkerColumn
  );
};

const areTerminalRowPropsEqual = (previous: TerminalRowProps, next: TerminalRowProps): boolean => {
  const isFontUnchanged =
    previous.fontFamily === next.fontFamily &&
    previous.boldFontFamily === next.boldFontFamily &&
    previous.fontSize === next.fontSize &&
    previous.lineHeight === next.lineHeight;
  if (
    !isFontUnchanged ||
    previous.cursorColumn !== next.cursorColumn ||
    !isSameRowSelection(previous.selection, next.selection)
  ) {
    return false;
  }
  if (previous.row.segments.length !== next.row.segments.length) {
    return false;
  }
  return previous.row.segments.every((segment, index) => {
    return isSameSegment(segment, next.row.segments[index]);
  });
};

const pieceStyleOf = (piece: TerminalRowPiece, font: TerminalFontProps): TextStyle => {
  const base = segmentStyleOf(piece.segment, font);
  if (piece.backgroundColor === null) {
    return base;
  }
  return { ...base, backgroundColor: piece.backgroundColor };
};

const TerminalRow = memo(function TerminalRow({ cursorColumn, row, selection, ...font }: TerminalRowProps) {
  const cursorSegments =
    cursorColumn === null ? row.segments : terminalViewUtil.splitRowForCursor({ cursorColumn, row });
  const pieces =
    selection === null
      ? cursorSegments.map((segment) => {
          return { backgroundColor: null, segment };
        })
      : terminalViewUtil.splitRowForSelection({ selection, segments: cursorSegments });
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.row,
        {
          fontFamily: font.fontFamily,
          fontSize: font.fontSize,
          lineHeight: font.lineHeight,
        },
      ]}
    >
      {pieces.map((piece, index) => {
        return (
          <Text key={index} style={pieceStyleOf(piece, font)}>
            {piece.segment.text}
          </Text>
        );
      })}
    </Text>
  );
},
areTerminalRowPropsEqual);

export function TerminalView({
  boldFontFamily,
  charWidthPx,
  followRequestCount = 0,
  fontFamily,
  fontSize,
  isCursorVisible,
  isRemoteScrollEnabled = false,
  lineHeight,
  onPress,
  onScrollRows,
  onSelectionLongPress,
  onSelectionMarkerSwitch,
  onSelectionMove,
  onSurfaceLayout,
  selection = null,
  selectionMoveMode = 'relative',
  snapshot,
}: TerminalViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isDraggingRef = useRef(false);
  const isFollowingTailRef = useRef(true);
  const consumedDyRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{
    locationX: number;
    locationY: number;
    pageX: number;
    pageY: number;
  } | null>(null);
  const selectionGrantPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectionGestureMarkerRef = useRef<TerminalSelectionPosition | null>(null);
  const selectionGestureDeltaRef = useRef({ dx: 0, dy: 0 });
  const selectionLastTapAtRef = useRef(0);
  const scrollOffsetPxRef = useRef(0);
  const contentHeightPxRef = useRef(0);
  const viewportHeightPxRef = useRef(0);
  const selectionAutoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectionAutoScrollTickRef = useRef<() => void>(() => {
    return;
  });

  // tmux stays on the normal buffer, so the alternate-buffer flag alone never
  // routes its swipes to the remote scroll handler - the session reports that
  // the remote owns scrolling instead.
  const isRemoteScroll =
    onScrollRows !== undefined && (snapshot.isAlternateBuffer || isRemoteScrollEnabled);

  const isSelecting = selection !== null;

  const [remotePanHandlers, setRemotePanHandlers] = useState<GestureResponderHandlers>({});
  const [selectionPanHandlers, setSelectionPanHandlers] = useState<GestureResponderHandlers>({});

  const scrollbackCount = terminalViewUtil.scrollbackCountOf({ isRemoteScroll, snapshot });

  const activeMarkerPosition = selection === null ? null : selection[selection.activeMarker];

  // The overlay stretches over the scrolled content (or the remote viewport),
  // so touch coordinates are already row-space and no scroll offset bookkeeping
  // is needed. The ref lets the selection responder stay built once while the
  // 32ms output tick keeps producing new snapshots.
  const selectionMappingRef = useRef({
    activeMarkerPosition,
    charWidthPx: charWidthPx ?? 0,
    isRemoteScroll,
    lineHeight,
    scrollbackCount,
    selectionMoveMode,
    snapshot,
  });

  useEffect(() => {
    selectionMappingRef.current = {
      activeMarkerPosition,
      charWidthPx: charWidthPx ?? 0,
      isRemoteScroll,
      lineHeight,
      scrollbackCount,
      selectionMoveMode,
      snapshot,
    };
  });

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const positionFromOverlayPoint = (pointX: number, pointY: number): TerminalSelectionPosition => {
    return terminalViewUtil.selectionPositionFromPoint({
      charWidthPx: charWidthPx ?? 0,
      lineHeight,
      pointX,
      pointY,
      scrollbackCount,
      snapshot,
    });
  };

  const selectionPositionFromMappingPoint = useCallback(
    (pointX: number, pointY: number): TerminalSelectionPosition => {
      const mapping = selectionMappingRef.current;
      return terminalViewUtil.selectionPositionFromPoint({
        charWidthPx: mapping.charWidthPx,
        lineHeight: mapping.lineHeight,
        pointX,
        pointY,
        scrollbackCount: mapping.scrollbackCount,
        snapshot: mapping.snapshot,
      });
    },
    []
  );

  const selectionDragMarkerPosition = useCallback(
    (): TerminalSelectionPosition | null => {
      const mapping = selectionMappingRef.current;
      const gestureDelta = selectionGestureDeltaRef.current;
      if (mapping.selectionMoveMode === 'follow') {
        const dragPoint = selectionGrantPointRef.current;
        if (dragPoint === null) {
          return null;
        }
        return selectionPositionFromMappingPoint(
          dragPoint.x + gestureDelta.dx,
          dragPoint.y + gestureDelta.dy
        );
      }
      const markerStart = selectionGestureMarkerRef.current;
      if (markerStart === null) {
        return null;
      }
      const deltaLine = mapping.lineHeight > 0 ? gestureDelta.dy / mapping.lineHeight : 0;
      const deltaCol = mapping.charWidthPx > 0 ? gestureDelta.dx / mapping.charWidthPx : 0;
      return {
        col: markerStart.col + Math.round(deltaCol),
        line: markerStart.line + Math.round(deltaLine),
      };
    },
    [selectionPositionFromMappingPoint]
  );

  const stopSelectionAutoScroll = useCallback(() => {
    if (selectionAutoScrollTimerRef.current === null) {
      return;
    }
    clearInterval(selectionAutoScrollTimerRef.current);
    selectionAutoScrollTimerRef.current = null;
  }, []);

  // Scrolls the surface just enough to bring an off-screen marker row into
  // view, one row inside the nearest edge. Only the local ScrollView can
  // reveal content; the remote surface shows just the remote viewport.
  const revealSelectionMarker = useCallback((markerLine: number) => {
    const mapping = selectionMappingRef.current;
    if (mapping.isRemoteScroll || mapping.activeMarkerPosition === null) {
      return;
    }
    const targetOffsetPx = terminalViewUtil.revealScrollOffsetOf({
      contentHeightPx: contentHeightPxRef.current,
      lineHeight: mapping.lineHeight,
      markerLine,
      offsetPx: scrollOffsetPxRef.current,
      snapshot: mapping.snapshot,
      viewportHeightPx: viewportHeightPxRef.current,
    });
    if (targetOffsetPx === null || targetOffsetPx === scrollOffsetPxRef.current) {
      return;
    }
    const maxOffsetPx = Math.max(0, contentHeightPxRef.current - viewportHeightPxRef.current);
    scrollOffsetPxRef.current = targetOffsetPx;
    isFollowingTailRef.current = maxOffsetPx - targetOffsetPx <= mapping.lineHeight / 2;
    scrollRef.current?.scrollTo({ animated: true, y: targetOffsetPx });
  }, []);

  // Auto-scroll only applies to the local ScrollView surface: the remote
  // surface shows just the remote viewport, so there is no local content to
  // reveal while the marker rides the screen edge.
  const updateSelectionAutoScroll = useCallback(
    (markerLine: number) => {
      const mapping = selectionMappingRef.current;
      if (mapping.isRemoteScroll) {
        stopSelectionAutoScroll();
        return;
      }
      const direction = terminalViewUtil.autoScrollDirectionOf({
        lineHeight: mapping.lineHeight,
        markerLine,
        offsetPx: scrollOffsetPxRef.current,
        snapshot: mapping.snapshot,
        viewportHeightPx: viewportHeightPxRef.current,
      });
      if (direction === 0) {
        stopSelectionAutoScroll();
        return;
      }
      if (selectionAutoScrollTimerRef.current === null) {
        selectionAutoScrollTimerRef.current = setInterval(() => {
          selectionAutoScrollTickRef.current();
        }, constant.terminal.gesture.autoScrollIntervalMs);
      }
    },
    [stopSelectionAutoScroll]
  );

  const emitSelectionPosition = useCallback(
    (position: TerminalSelectionPosition) => {
      onSelectionMove?.(position);
      updateSelectionAutoScroll(position.line);
    },
    [onSelectionMove, updateSelectionAutoScroll]
  );

  // One tick scrolls the surface by a row toward the marker. While the marker
  // rides the screen edge the gesture base stretches by the same row, so the
  // selection keeps extending; while the marker sits beyond the edge (a fast
  // relative fling) the view catches up without moving the marker.
  const runSelectionAutoScrollTick = useCallback(() => {
    const mapping = selectionMappingRef.current;
    const markerPosition = selectionDragMarkerPosition();
    if (markerPosition === null) {
      stopSelectionAutoScroll();
      return;
    }
    const direction = terminalViewUtil.autoScrollDirectionOf({
      lineHeight: mapping.lineHeight,
      markerLine: markerPosition.line,
      offsetPx: scrollOffsetPxRef.current,
      snapshot: mapping.snapshot,
      viewportHeightPx: viewportHeightPxRef.current,
    });
    if (direction === 0) {
      stopSelectionAutoScroll();
      return;
    }
    const markerTopPx =
      (markerPosition.line - mapping.snapshot.firstLine) * mapping.lineHeight -
      scrollOffsetPxRef.current;
    const isMarkerRowVisible =
      markerTopPx + mapping.lineHeight > 0 && markerTopPx < viewportHeightPxRef.current;
    const isCatchUpOnly = mapping.selectionMoveMode !== 'follow' && !isMarkerRowVisible;
    const maxOffsetPx = Math.max(0, contentHeightPxRef.current - viewportHeightPxRef.current);
    const nextOffsetPx = Math.min(
      Math.max(scrollOffsetPxRef.current + direction * mapping.lineHeight, 0),
      maxOffsetPx
    );
    const isOffsetChanged = nextOffsetPx !== scrollOffsetPxRef.current;
    if (isOffsetChanged) {
      scrollOffsetPxRef.current = nextOffsetPx;
      isFollowingTailRef.current = maxOffsetPx - nextOffsetPx <= mapping.lineHeight / 2;
      scrollRef.current?.scrollTo({ animated: false, y: nextOffsetPx });
    }
    if (!isCatchUpOnly) {
      if (mapping.selectionMoveMode === 'follow') {
        const dragPoint = selectionGrantPointRef.current;
        if (dragPoint !== null) {
          dragPoint.y += direction * mapping.lineHeight;
        }
      } else {
        const markerStart = selectionGestureMarkerRef.current;
        if (markerStart !== null) {
          markerStart.line += direction;
        }
      }
      const extendedPosition = selectionDragMarkerPosition();
      if (extendedPosition !== null) {
        emitSelectionPosition(extendedPosition);
      }
    }
    if (!isOffsetChanged) {
      stopSelectionAutoScroll();
    }
  }, [emitSelectionPosition, selectionDragMarkerPosition, stopSelectionAutoScroll]);

  useEffect(() => {
    selectionAutoScrollTickRef.current = runSelectionAutoScrollTick;
  });

  useEffect(() => {
    if (!isSelecting) {
      stopSelectionAutoScroll();
    }
    return () => {
      stopSelectionAutoScroll();
    };
  }, [isSelecting, stopSelectionAutoScroll]);

  // Switching the active marker (double tap, marker keys) can land on a row
  // outside the visible window; during drags the gesture owns scrolling, so
  // the reveal only runs between gestures.
  useEffect(() => {
    if (activeMarkerPosition === null || selectionGrantPointRef.current !== null) {
      return;
    }
    revealSelectionMarker(activeMarkerPosition.line);
  }, [activeMarkerPosition, revealSelectionMarker]);

  useEffect(() => {
    const responder = PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        return Math.abs(gestureState.dy) > 0;
      },
      onPanResponderMove: (_event, gestureState) => {
        cancelLongPress();
        const rows = terminalViewUtil.rowsScrolledBy({
          deltaPx: gestureState.dy - consumedDyRef.current,
          lineHeight,
        });
        if (rows === 0) {
          return;
        }
        consumedDyRef.current -= rows * lineHeight;
        onScrollRows?.({ rows });
      },
      onPanResponderRelease: () => {
        consumedDyRef.current = 0;
      },
      onPanResponderTerminate: () => {
        consumedDyRef.current = 0;
      },
    });
    setRemotePanHandlers(responder.panHandlers);
  }, [cancelLongPress, lineHeight, onScrollRows]);

  useEffect(() => {
    const responder = PanResponder.create({
      onPanResponderGrant: (event: GestureResponderEvent) => {
        selectionGrantPointRef.current = {
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
        };
        selectionGestureDeltaRef.current = { dx: 0, dy: 0 };
        const mapping = selectionMappingRef.current;
        if (mapping.selectionMoveMode === 'follow') {
          const markerPosition = selectionDragMarkerPosition();
          if (markerPosition !== null) {
            emitSelectionPosition(markerPosition);
          }
          return;
        }
        selectionGestureMarkerRef.current = mapping.activeMarkerPosition;
      },
      onPanResponderMove: (_event: GestureResponderEvent, gestureState) => {
        const start = selectionGrantPointRef.current;
        if (start === null) {
          return;
        }
        selectionGestureDeltaRef.current = { dx: gestureState.dx, dy: gestureState.dy };
        const markerPosition = selectionDragMarkerPosition();
        if (markerPosition !== null) {
          emitSelectionPosition(markerPosition);
        }
      },
      onPanResponderRelease: (_event: GestureResponderEvent, gestureState) => {
        const releasePosition = selectionDragMarkerPosition();
        selectionGrantPointRef.current = null;
        selectionGestureMarkerRef.current = null;
        selectionGestureDeltaRef.current = { dx: 0, dy: 0 };
        stopSelectionAutoScroll();
        if (releasePosition !== null) {
          revealSelectionMarker(releasePosition.line);
        }
        const isTap =
          Math.abs(gestureState.dx) < constant.terminal.gesture.doubleTapSlopPx &&
          Math.abs(gestureState.dy) < constant.terminal.gesture.doubleTapSlopPx;
        if (!isTap) {
          return;
        }
        const tappedAt = Date.now();
        if (tappedAt - selectionLastTapAtRef.current <= constant.terminal.gesture.doubleTapMs) {
          selectionLastTapAtRef.current = 0;
          onSelectionMarkerSwitch?.();
          return;
        }
        selectionLastTapAtRef.current = tappedAt;
      },
      onPanResponderTerminate: () => {
        const terminatePosition = selectionDragMarkerPosition();
        selectionGrantPointRef.current = null;
        selectionGestureMarkerRef.current = null;
        selectionGestureDeltaRef.current = { dx: 0, dy: 0 };
        stopSelectionAutoScroll();
        if (terminatePosition !== null) {
          revealSelectionMarker(terminatePosition.line);
        }
      },
      onStartShouldSetPanResponder: () => {
        return true;
      },
    });
    setSelectionPanHandlers(responder.panHandlers);
  }, [
    emitSelectionPosition,
    onSelectionMarkerSwitch,
    revealSelectionMarker,
    selectionDragMarkerPosition,
    stopSelectionAutoScroll,
  ]);

  const distanceFromTailOf = (event: NativeSyntheticEvent<NativeScrollEvent>): number => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    return contentSize.height - layoutMeasurement.height - contentOffset.y;
  };

  const updateTailFollow = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isFollowingTailRef.current = distanceFromTailOf(event) <= lineHeight / 2;
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetPxRef.current = event.nativeEvent.contentOffset.y;
    if (!isDraggingRef.current) {
      return;
    }
    updateTailFollow(event);
  };

  const handleContentSizeChange = (contentWidthPx: number, contentHeightPx: number): void => {
    contentHeightPxRef.current = contentHeightPx;
    scrollTowardTail();
  };

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDraggingRef.current = false;
    updateTailFollow(event);
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateTailFollow(event);
  };

  const scrollTowardTail = () => {
    if (isDraggingRef.current || !isFollowingTailRef.current) {
      return;
    }
    scrollRef.current?.scrollToEnd({ animated: false });
  };

  useEffect(() => {
    isFollowingTailRef.current = true;
    scrollTowardTail();
  }, [followRequestCount]);

  const handleOverlayTouchStart = (event: GestureResponderEvent): void => {
    cancelLongPress();
    if (isSelecting || event.nativeEvent.touches.length !== 1) {
      return;
    }
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    longPressStartRef.current = { locationX, locationY, pageX, pageY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      const start = longPressStartRef.current;
      longPressStartRef.current = null;
      if (start === null) {
        return;
      }
      onSelectionLongPress?.(positionFromOverlayPoint(start.locationX, start.locationY));
    }, constant.terminal.gesture.longPressMs);
  };

  const handleOverlayTouchMove = (event: GestureResponderEvent): void => {
    const start = longPressStartRef.current;
    if (start === null) {
      return;
    }
    const touch = event.nativeEvent.touches[0];
    if (touch === undefined) {
      return;
    }
    const deltaX = touch.pageX - start.pageX;
    const deltaY = touch.pageY - start.pageY;
    if (
      deltaX * deltaX + deltaY * deltaY >=
      constant.terminal.gesture.longPressSlopPx * constant.terminal.gesture.longPressSlopPx
    ) {
      cancelLongPress();
    }
  };

  const handleOverlayTouchEnd = (): void => {
    cancelLongPress();
  };

  const visibleRows = snapshot.rows.slice(scrollbackCount);

  const terminalRows = visibleRows.map((row, y) => {
    const line = snapshot.firstLine + scrollbackCount + y;
    const isCursorRow = isCursorVisible && snapshot.cursor.y - scrollbackCount === y;
    const cursorColumn = isCursorRow ? snapshot.cursor.x : null;
    const rowSelection =
      selection === null ? null : rowSelectionOf(selection, line, rowTextOf(row).length);
    return (
      <TerminalRow
        boldFontFamily={boldFontFamily}
        cursorColumn={cursorColumn}
        fontFamily={fontFamily}
        fontSize={fontSize}
        key={line}
        lineHeight={lineHeight}
        row={row}
        selection={rowSelection}
      />
    );
  });

  const handleSurfaceLayout = (event: LayoutChangeEvent): void => {
    const { height, width } = event.nativeEvent.layout;
    viewportHeightPxRef.current = height;
    onSurfaceLayout?.({ heightPx: height, widthPx: width });
    scrollTowardTail();
  };

  // The overlay rides on top of the rows: passive while idle so scrolling and
  // the long-press timer coexist, claiming every touch once a selection is
  // active so drags move the marker instead of scrolling.
  const selectionOverlay = (
    <View
      onTouchCancel={handleOverlayTouchEnd}
      onTouchEnd={handleOverlayTouchEnd}
      onTouchMove={handleOverlayTouchMove}
      onTouchStart={handleOverlayTouchStart}
      style={styles.selectionOverlay}
      testID="terminal-selection-overlay"
      {...(isSelecting ? selectionPanHandlers : {})}
    />
  );

  const terminalSurface = isRemoteScroll ? (
    <View
      onLayout={handleSurfaceLayout}
      style={styles.scrollView}
      testID="terminal-scroll-remote"
      {...(isSelecting ? {} : remotePanHandlers)}
    >
      {terminalRows}
      {selectionOverlay}
    </View>
  ) : (
    <ScrollView
      contentContainerStyle={styles.rows}
      keyboardShouldPersistTaps="always"
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleSurfaceLayout}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      onScroll={handleScroll}
      onScrollBeginDrag={() => {
        isDraggingRef.current = true;
        cancelLongPress();
      }}
      onScrollEndDrag={handleScrollEndDrag}
      ref={scrollRef}
      scrollEnabled={!isSelecting}
      scrollEventThrottle={16}
      style={styles.scrollView}
      testID="terminal-scroll"
    >
      {terminalRows}
      {selectionOverlay}
    </ScrollView>
  );

  if (onPress === undefined) {
    return (
      <View style={styles.container} testID="terminal-view">
        {terminalSurface}
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.container} testID="terminal-view">
      {terminalSurface}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: constant.terminal.bg,
    flex: 1,
  },
  rows: {
    flexGrow: 1,
  },
  scrollView: {
    flex: 1,
  },
  row: {
    color: constant.terminal.fg,
    flexGrow: 1,
  },
  selectionOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
