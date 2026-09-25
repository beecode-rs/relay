import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';

import { constant } from '@/constants/constant';
import type { TerminalSelectionPosition, TerminalSelectionState } from '@/features/terminal/terminal-selection';
import { TerminalView } from '@/features/terminal/terminal-view';
import { terminalViewUtil } from '@/features/terminal/terminal-view-util';
import { terminalPaletteUtil } from '@/services/terminal/terminal-palette';
import type { StyledSegment, TerminalSnapshot } from '@/services/terminal/terminal-serializer';

const FONT = {
  boldFontFamily: 'JetBrainsMono_700Bold',
  fontFamily: 'JetBrainsMono_400Regular',
  fontSize: 14,
  lineHeight: 18,
};

const segment = (overrides: Partial<StyledSegment>): StyledSegment => {
  return { bold: false, inverse: false, text: '', underline: false, ...overrides };
};

const buildSnapshot = (cursor: { x: number; y: number }, isAlternateBuffer = false): TerminalSnapshot => {
  return {
    rows: [
      {
        segments: [
          segment({ text: 'hello ' }),
          segment({ fgColor: 1, text: 'red' }),
          segment({ text: '!' }),
        ],
      },
      {
        segments: [
          segment({ text: 'plain ' }),
          segment({ bold: true, text: 'u', underline: true }),
        ],
      },
    ],
    cursor,
    firstLine: 0,
    isAlternateBuffer,
    viewportRowCount: 2,
  };
};

const buildScrollbackSnapshot = (): TerminalSnapshot => {
  return {
    rows: [
      { segments: [segment({ text: 'old-a' })] },
      { segments: [segment({ text: 'old-b' })] },
      { segments: [segment({ text: 'live-a' })] },
      { segments: [segment({ text: 'live-b' })] },
    ],
    cursor: { x: 0, y: 2 },
    firstLine: 0,
    isAlternateBuffer: false,
    viewportRowCount: 2,
  };
};

const buildTallSnapshot = (rowCount: number): TerminalSnapshot => {
  return {
    rows: Array.from({ length: rowCount }, (_unused, index) => {
      return { segments: [segment({ text: `row-${index}` })] };
    }),
    cursor: { x: 0, y: 0 },
    firstLine: 0,
    isAlternateBuffer: false,
    viewportRowCount: 10,
  };
};

type JsonNode = { type?: string; children?: unknown[] };

type RemoteSurface = { props: Record<string, unknown> };

// Drives a View's PanResponder move handler the way the native responder system
// does: each event carries a touch history whose previous/current centroid
// positions express one incremental drag step, with strictly increasing
// timestamps so every event is processed.
const panMoveDriver = (surface: RemoteSurface) => {
  const onResponderMove = surface.props.onResponderMove as (event: unknown) => void;
  const touchState = { previousY: 500, timestamp: 100 };
  const step = (deltaPx: number) => {
    const currentY = touchState.previousY + deltaPx;
    onResponderMove({
      touchHistory: {
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: touchState.timestamp,
        numberActiveTouches: 1,
        touchBank: [
          {
            currentTimeStamp: touchState.timestamp,
            currentPageX: 10,
            currentPageY: currentY,
            previousPageX: 10,
            previousPageY: touchState.previousY,
            touchActive: true,
          },
        ],
      },
    });
    touchState.timestamp += 1;
    touchState.previousY = currentY;
  };
  return {
    dragBy(stepPx: number, stepCount: number) {
      Array.from({ length: stepCount }, () => {
        return step(stepPx);
      });
      return this;
    },
    rowsSentBy(onScrollRows: jest.Mock) {
      return onScrollRows.mock.calls.map((call) => {
        return call[0].rows as number;
      });
    },
  };
};

const countTextNodes = (node: unknown): number => {
  if (Array.isArray(node)) {
    return node.reduce((total, child) => {
      return total + countTextNodes(child);
    }, 0);
  }
  if (node === null || typeof node !== 'object') {
    return 0;
  }
  const candidate = node as JsonNode;
  const selfCount = candidate.type === 'Text' ? 1 : 0;
  return selfCount + countTextNodes(candidate.children);
};

describe('TerminalView', () => {
  it('renders rows with palette-colored and emphasized segments', async () => {
    const view = await render(
      <TerminalView isCursorVisible={false} snapshot={buildSnapshot({ x: 0, y: 0 })} {...FONT} />
    );
    const red = screen.getByText('red');
    expect(red.props.style.color).toBe(terminalPaletteUtil.colorAt({ index: 1 }));
    expect(red.props.style.backgroundColor).toBe(constant.terminal.bg);
    const emphasized = screen.getByText('u');
    expect(emphasized.props.style.fontFamily).toBe(FONT.boldFontFamily);
    expect(emphasized.props.style.fontWeight).toBe('700');
    expect(emphasized.props.style.textDecorationLine).toBe('underline');
    expect(countTextNodes(view.toJSON())).toBe(7);
  });

  it('renders the cursor cell inverse on its row', async () => {
    await render(<TerminalView isCursorVisible snapshot={buildSnapshot({ x: 9, y: 0 })} {...FONT} />);
    const cursorCell = screen.getByText('!');
    expect(cursorCell.props.style.backgroundColor).toBe(constant.terminal.fg);
    expect(cursorCell.props.style.color).toBe(constant.terminal.bg);
    expect(screen.getByText('red').props.style.backgroundColor).toBe(constant.terminal.bg);
  });

  it('pads the gap so the cursor block renders on its column beyond the row content', async () => {
    const view = await render(
      <TerminalView isCursorVisible snapshot={buildSnapshot({ x: 15, y: 1 })} {...FONT} />
    );
    expect(screen.getByText('plain ')).toBeTruthy();
    expect(screen.getByText('u').props.style.fontWeight).toBe('700');
    expect(countTextNodes(view.toJSON())).toBe(9);
  });

  it('leaves cells uninverted when the cursor is hidden', async () => {
    await render(
      <TerminalView isCursorVisible={false} snapshot={buildSnapshot({ x: 9, y: 0 })} {...FONT} />
    );
    const cell = screen.getByText('!');
    expect(cell.props.style.backgroundColor).toBe(constant.terminal.bg);
    expect(cell.props.style.color).toBe(constant.terminal.fg);
  });

  it('forwards presses to the container handler', async () => {
    const onPress = jest.fn();
    await render(
      <TerminalView
        isCursorVisible={false}
        onPress={onPress}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    await fireEvent.press(screen.getByTestId('terminal-view'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('leaves the touch responder free for scrolling when no press handler is provided', async () => {
    await render(
      <TerminalView isCursorVisible={false} snapshot={buildSnapshot({ x: 0, y: 0 })} {...FONT} />
    );
    expect(screen.getByTestId('terminal-view').props.onStartShouldSetResponder).toBeUndefined();
  });

  it('bounds the scroll surface height so scrollback content can scroll', async () => {
    await render(
      <TerminalView isCursorVisible={false} snapshot={buildSnapshot({ x: 0, y: 0 })} {...FONT} />
    );
    const scrollView = screen.getByTestId('terminal-scroll');
    expect(StyleSheet.flatten(scrollView.props.style)).toMatchObject({ flex: 1 });
  });

  it('renders the remote scroll surface instead of the local ScrollView on the alternate buffer', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        onScrollRows={() => {
          return;
        }}
        snapshot={buildSnapshot({ x: 0, y: 0 }, true)}
        {...FONT}
      />
    );
    expect(screen.queryByTestId('terminal-scroll')).toBeNull();
    expect(screen.getByTestId('terminal-scroll-remote')).toBeTruthy();
    expect(screen.getByText('hello ')).toBeTruthy();
  });

  it('renders the remote scroll surface when the session owns scrolling on the normal buffer', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        isRemoteScrollEnabled
        onScrollRows={() => {
          return;
        }}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.queryByTestId('terminal-scroll')).toBeNull();
    expect(screen.getByTestId('terminal-scroll-remote')).toBeTruthy();
    expect(screen.getByText('hello ')).toBeTruthy();
  });

  it('keeps the local ScrollView when the session does not own scrolling on the normal buffer', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        onScrollRows={() => {
          return;
        }}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByTestId('terminal-scroll')).toBeTruthy();
    expect(screen.queryByTestId('terminal-scroll-remote')).toBeNull();
  });

  it('hides local scrollback rows above the viewport on the remote scroll surface', async () => {
    await render(
      <TerminalView
        isCursorVisible
        isRemoteScrollEnabled
        onScrollRows={() => {
          return;
        }}
        snapshot={buildScrollbackSnapshot()}
        {...FONT}
      />
    );
    expect(screen.queryByTestId('terminal-scroll')).toBeNull();
    expect(screen.queryByText('old-a')).toBeNull();
    expect(screen.queryByText('old-b')).toBeNull();
    expect(screen.getByText('live-b')).toBeTruthy();
    const cursorCell = screen.getByText('l');
    expect(cursorCell.props.style.backgroundColor).toBe(constant.terminal.fg);
    expect(cursorCell.props.style.color).toBe(constant.terminal.bg);
    expect(screen.getByText('ive-a')).toBeTruthy();
  });

  it('scrolls the remote surface one row per line-height of upward drag without accumulating', async () => {
    const onScrollRows = jest.fn();
    await render(
      <TerminalView
        isCursorVisible={false}
        onScrollRows={onScrollRows}
        snapshot={buildSnapshot({ x: 0, y: 0 }, true)}
        {...FONT}
      />
    );
    const move = panMoveDriver(screen.getByTestId('terminal-scroll-remote'));

    // A slow, continuous 120px upward drag (~6-7 line heights) must emit ~6 rows total,
    // not double the row count on every move event.
    const scrolledRows = move.dragBy(-3, 40).rowsSentBy(onScrollRows);
    const totalRows = scrolledRows.reduce((total, rows) => {
      return total + rows;
    }, 0);
    expect(totalRows).toBe(6);
    expect(Math.max(...scrolledRows)).toBe(1);
  });

  it('maps a downward drag on the remote surface to negative rows', async () => {
    const onScrollRows = jest.fn();
    await render(
      <TerminalView
        isCursorVisible={false}
        onScrollRows={onScrollRows}
        snapshot={buildSnapshot({ x: 0, y: 0 }, true)}
        {...FONT}
      />
    );
    const move = panMoveDriver(screen.getByTestId('terminal-scroll-remote'));

    move.dragBy(FONT.lineHeight * 1.5, 1);
    expect(onScrollRows).toHaveBeenCalledTimes(1);
    expect(onScrollRows).toHaveBeenCalledWith({ rows: -1 });
  });
});

describe('rowsScrolledBy', () => {
  it('returns no rows for movements shorter than one line', () => {
    expect(terminalViewUtil.rowsScrolledBy({ deltaPx: FONT.lineHeight - 1, lineHeight: FONT.lineHeight })).toBe(0);
    expect(terminalViewUtil.rowsScrolledBy({ deltaPx: -3, lineHeight: FONT.lineHeight })).toBe(0);
  });

  it('maps an upward swipe to positive rows and a downward swipe to negative rows', () => {
    expect(terminalViewUtil.rowsScrolledBy({ deltaPx: -FONT.lineHeight, lineHeight: FONT.lineHeight })).toBe(1);
    expect(terminalViewUtil.rowsScrolledBy({ deltaPx: -FONT.lineHeight * 2.5, lineHeight: FONT.lineHeight })).toBe(2);
    expect(terminalViewUtil.rowsScrolledBy({ deltaPx: FONT.lineHeight * 1.5, lineHeight: FONT.lineHeight })).toBe(-1);
  });

  it('never divides by a non-positive line height', () => {
    expect(terminalViewUtil.rowsScrolledBy({ deltaPx: -100, lineHeight: 0 })).toBe(0);
  });
});

describe('scrollbackCountOf', () => {
  it('keeps every row for local scrolling when the surface is not remote', () => {
    expect(terminalViewUtil.scrollbackCountOf({ isRemoteScroll: false, snapshot: buildScrollbackSnapshot() })).toBe(0);
  });

  it('counts rows above the viewport for remote scrolling on the normal buffer', () => {
    expect(terminalViewUtil.scrollbackCountOf({ isRemoteScroll: true, snapshot: buildScrollbackSnapshot() })).toBe(2);
  });

  it('drops nothing when the snapshot holds only viewport rows', () => {
    expect(terminalViewUtil.scrollbackCountOf({ isRemoteScroll: true, snapshot: buildSnapshot({ x: 0, y: 0 }) })).toBe(0);
  });

  it('never returns a negative count for short snapshots', () => {
    const shortSnapshot = { ...buildSnapshot({ x: 0, y: 0 }), viewportRowCount: 9 };
    expect(terminalViewUtil.scrollbackCountOf({ isRemoteScroll: true, snapshot: shortSnapshot })).toBe(0);
  });
});

describe('autoScrollDirectionOf', () => {
  const directionOf = (params: { markerLine: number; offsetPx?: number; firstLine?: number }) => {
    return terminalViewUtil.autoScrollDirectionOf({
      lineHeight: FONT.lineHeight,
      markerLine: params.markerLine,
      offsetPx: params.offsetPx ?? 0,
      snapshot: { ...buildSnapshot({ x: 0, y: 0 }), firstLine: params.firstLine ?? 0 },
      viewportHeightPx: 180,
    });
  };

  it('returns no direction without a measurable viewport or line height', () => {
    expect(
      terminalViewUtil.autoScrollDirectionOf({
        lineHeight: FONT.lineHeight,
        markerLine: 0,
        offsetPx: 0,
        snapshot: buildSnapshot({ x: 0, y: 0 }),
        viewportHeightPx: 0,
      })
    ).toBe(0);
    expect(
      terminalViewUtil.autoScrollDirectionOf({
        lineHeight: 0,
        markerLine: 0,
        offsetPx: 0,
        snapshot: buildSnapshot({ x: 0, y: 0 }),
        viewportHeightPx: 180,
      })
    ).toBe(0);
  });

  it('points up while the marker row tops the viewport', () => {
    expect(directionOf({ markerLine: 0 })).toBe(-1);
    expect(directionOf({ markerLine: 2, offsetPx: 2 * FONT.lineHeight + 1 })).toBe(-1);
  });

  it('points down while the marker row meets the bottom edge', () => {
    expect(directionOf({ markerLine: 9 })).toBe(1);
    expect(directionOf({ markerLine: 8 })).toBe(0);
  });

  it('holds still for markers away from either edge', () => {
    expect(directionOf({ markerLine: 1 })).toBe(0);
    expect(directionOf({ markerLine: 5 })).toBe(0);
  });

  it('accounts for the snapshot firstLine and the scroll offset', () => {
    expect(directionOf({ markerLine: 41, firstLine: 40, offsetPx: 36 })).toBe(-1);
    expect(directionOf({ markerLine: 52, firstLine: 40, offsetPx: 36 })).toBe(1);
  });
});

const position = (line: number, col: number): TerminalSelectionPosition => {
  return { col, line };
};

const selectionState = (
  from: TerminalSelectionPosition,
  to: TerminalSelectionPosition,
  activeMarker: TerminalSelectionState['activeMarker'] = 'from'
): TerminalSelectionState => {
  return { activeMarker, from, to };
};

type DraggableSurface = { props: Record<string, any> };

const driveSelectionDrag = (
  overlay: DraggableSurface,
  grant: { x: number; y: number },
  delta: { dx: number; dy: number }
) => {
  overlay.props.onResponderGrant({
    nativeEvent: { locationX: grant.x, locationY: grant.y },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 100,
      numberActiveTouches: 1,
      touchBank: [
        {
          currentPageX: grant.x,
          currentPageY: grant.y,
          previousPageX: grant.x,
          previousPageY: grant.y,
          touchActive: true,
        },
      ],
    },
  });
  overlay.props.onResponderMove({
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 101,
      numberActiveTouches: 1,
      touchBank: [
        {
          currentPageX: grant.x + delta.dx,
          currentPageY: grant.y + delta.dy,
          currentTimeStamp: 101,
          previousPageX: grant.x,
          previousPageY: grant.y,
          touchActive: true,
        },
      ],
    },
  });
};

// Fires one more selection-responder move on top of an existing driveSelectionDrag
// gesture; PanResponder accumulates each event's current-previous step, so the
// previous position must be the finger's actual last sampled page position.
const driveSelectionMoveTo = (
  overlay: DraggableSurface,
  from: { x: number; y: number },
  to: { x: number; y: number }
) => {
  overlay.props.onResponderMove({
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 102,
      numberActiveTouches: 1,
      touchBank: [
        {
          currentPageX: to.x,
          currentPageY: to.y,
          currentTimeStamp: 102,
          previousPageX: from.x,
          previousPageY: from.y,
          touchActive: true,
        },
      ],
    },
  });
};

// Seeds the local ScrollView's tracked metrics the way native layout, content
// and scroll events would, so edge detection has a real viewport to work with.
const primeScrollViewMetrics = (params: { contentHeightPx: number; viewportHeightPx: number }) => {
  const scrollView = screen.getByTestId('terminal-scroll');
  scrollView.props.onLayout({
    nativeEvent: { layout: { height: params.viewportHeightPx, width: 400 } },
  });
  scrollView.props.onContentSizeChange(400, params.contentHeightPx);
  scrollView.props.onScroll({
    nativeEvent: {
      contentOffset: { y: 0 },
      contentSize: { height: params.contentHeightPx },
      layoutMeasurement: { height: params.viewportHeightPx },
    },
  });
  return scrollView;
};

const touchStartEvent = (x: number, y: number, touchCount = 1) => {
  return {
    nativeEvent: {
      locationX: x,
      locationY: y,
      pageX: x,
      pageY: y,
      touches: Array.from({ length: touchCount }, () => {
        return { pageX: x, pageY: y };
      }),
    },
  };
};

const tapSelectionOverlay = (overlay: DraggableSurface) => {
  overlay.props.onResponderGrant({
    nativeEvent: { locationX: 5, locationY: 5 },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 100,
      numberActiveTouches: 1,
      touchBank: [
        {
          currentPageX: 5,
          currentPageY: 5,
          previousPageX: 5,
          previousPageY: 5,
          touchActive: true,
        },
      ],
    },
  });
  overlay.props.onResponderRelease({});
};

const touchMoveEvent = (x: number, y: number) => {
  return {
    nativeEvent: {
      touches: [{ pageX: x, pageY: y }],
    },
  };
};

describe('TerminalView selection rendering', () => {
  it('highlights the selected cells and both markers on the selected row', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        selection={selectionState(position(0, 2), position(0, 7))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByText('l').props.style.backgroundColor).toBe(constant.terminal.selection.fromActiveBg);
    expect(screen.getByText('lo ').props.style.backgroundColor).toBe(constant.terminal.selection.bg);
    expect(screen.getByText('r').props.style.backgroundColor).toBe(constant.terminal.selection.bg);
    expect(screen.getByText('e').props.style.backgroundColor).toBe(constant.terminal.selection.toBg);
    expect(screen.getByText('d').props.style.backgroundColor).toBe(constant.terminal.bg);
    expect(screen.getByText('!').props.style.backgroundColor).toBe(constant.terminal.bg);
  });

  it('uses the brighter variant for the active to marker', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        selection={selectionState(position(0, 2), position(0, 7), 'to')}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByText('e').props.style.backgroundColor).toBe(constant.terminal.selection.toActiveBg);
    expect(screen.getByText('l').props.style.backgroundColor).toBe(constant.terminal.selection.fromBg);
  });

  it('leaves rows outside the selection untouched', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        selection={selectionState(position(0, 2), position(0, 7))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByText('plain ').props.style.backgroundColor).toBe(constant.terminal.bg);
    expect(screen.getByText('u').props.style.backgroundColor).toBe(constant.terminal.bg);
  });

  it('covers partial rows across a multi-line selection', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        selection={selectionState(position(0, 9), position(1, 5))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByText('!').props.style.backgroundColor).toBe(constant.terminal.selection.fromActiveBg);
    expect(screen.getByText('plain').props.style.backgroundColor).toBe(constant.terminal.selection.bg);
    expect(screen.getByText(' ').props.style.backgroundColor).toBe(constant.terminal.selection.toBg);
  });
});

describe('TerminalView selection gestures', () => {
  it('disables the local ScrollView while selecting', async () => {
    await render(
      <TerminalView
        isCursorVisible={false}
        selection={selectionState(position(0, 0), position(0, 3))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByTestId('terminal-scroll').props.scrollEnabled).toBe(false);
  });

  it('claims touches on the overlay only while selecting', async () => {
    const rerenderView = await render(
      <TerminalView
        isCursorVisible={false}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByTestId('terminal-selection-overlay').props.onStartShouldSetResponder).toBeUndefined();
    await rerenderView.rerender(
      <TerminalView
        isCursorVisible={false}
        selection={selectionState(position(0, 0), position(0, 3))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    expect(screen.getByTestId('terminal-selection-overlay').props.onStartShouldSetResponder()).toBe(true);
  });

  it('strips the remote scroll handlers from the remote surface while selecting', async () => {
    const onScrollRows = jest.fn();
    const rerenderView = await render(
      <TerminalView
        isCursorVisible={false}
        onScrollRows={onScrollRows}
        snapshot={buildSnapshot({ x: 0, y: 0 }, true)}
        {...FONT}
      />
    );
    expect(screen.getByTestId('terminal-scroll-remote').props.onResponderMove).toBeDefined();
    await rerenderView.rerender(
      <TerminalView
        isCursorVisible={false}
        onScrollRows={onScrollRows}
        selection={selectionState(position(0, 0), position(0, 3))}
        snapshot={buildSnapshot({ x: 0, y: 0 }, true)}
        {...FONT}
      />
    );
    expect(screen.getByTestId('terminal-scroll-remote').props.onResponderMove).toBeUndefined();
  });

  it('moves the active marker to the tapped cell and along the drag in follow mode', async () => {
    const onSelectionMove = jest.fn();
    await render(
      <TerminalView
        charWidthPx={10}
        isCursorVisible={false}
        onSelectionMove={onSelectionMove}
        selection={selectionState(position(0, 0), position(0, 3))}
        selectionMoveMode="follow"
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    driveSelectionDrag(screen.getByTestId('terminal-selection-overlay'), { x: 25, y: 20 }, { dx: 20, dy: 36 });
    expect(onSelectionMove).toHaveBeenNthCalledWith(1, position(1, 2));
    expect(onSelectionMove).toHaveBeenNthCalledWith(2, position(1, 4));
  });

  it('moves the marker by the swiped cells from its own position in relative mode', async () => {
    const onSelectionMove = jest.fn();
    await render(
      <TerminalView
        charWidthPx={10}
        isCursorVisible={false}
        onSelectionMove={onSelectionMove}
        selection={selectionState(position(0, 0), position(0, 3))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    driveSelectionDrag(screen.getByTestId('terminal-selection-overlay'), { x: 70, y: 90 }, { dx: 25, dy: 27 });
    expect(onSelectionMove).toHaveBeenCalledTimes(1);
    expect(onSelectionMove).toHaveBeenCalledWith(position(2, 3));
  });

  it('switches the active marker on a double tap', async () => {
    const onSelectionMarkerSwitch = jest.fn();
    await render(
      <TerminalView
        charWidthPx={10}
        isCursorVisible={false}
        onSelectionMarkerSwitch={onSelectionMarkerSwitch}
        selection={selectionState(position(0, 0), position(0, 3))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    const overlay = screen.getByTestId('terminal-selection-overlay');
    tapSelectionOverlay(overlay);
    expect(onSelectionMarkerSwitch).not.toHaveBeenCalled();
    tapSelectionOverlay(overlay);
    expect(onSelectionMarkerSwitch).toHaveBeenCalledTimes(1);
  });

  it('does not treat the release of a drag as a tap', async () => {
    const onSelectionMarkerSwitch = jest.fn();
    await render(
      <TerminalView
        charWidthPx={10}
        isCursorVisible={false}
        onSelectionMarkerSwitch={onSelectionMarkerSwitch}
        selection={selectionState(position(0, 0), position(0, 3))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    const overlay = screen.getByTestId('terminal-selection-overlay');
    driveSelectionDrag(overlay, { x: 30, y: 30 }, { dx: 60, dy: 0 });
    overlay.props.onResponderRelease({});
    tapSelectionOverlay(overlay);
    expect(onSelectionMarkerSwitch).not.toHaveBeenCalled();
  });

  it('does not jump the marker when the drag starts in relative mode', async () => {
    const onSelectionMove = jest.fn();
    await render(
      <TerminalView
        charWidthPx={10}
        isCursorVisible={false}
        onSelectionMove={onSelectionMove}
        selection={selectionState(position(0, 6), position(0, 9))}
        snapshot={buildSnapshot({ x: 0, y: 0 })}
        {...FONT}
      />
    );
    screen.getByTestId('terminal-selection-overlay').props.onResponderGrant({
      nativeEvent: { locationX: 2, locationY: 2 },
      touchHistory: {
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: 100,
        numberActiveTouches: 1,
        touchBank: [
          {
            currentPageX: 2,
            currentPageY: 2,
            previousPageX: 2,
            previousPageY: 2,
            touchActive: true,
          },
        ],
      },
    });
    expect(onSelectionMove).not.toHaveBeenCalled();
  });

  it('long-presses map the touched cell into a selection start', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionLongPress = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionLongPress={onSelectionLongPress}
          snapshot={buildSnapshot({ x: 0, y: 0 })}
          {...FONT}
        />
      );
      await fireEvent(
        screen.getByTestId('terminal-selection-overlay'),
        'touchStart',
        touchStartEvent(25, 20)
      );
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.longPressMs);
      });
      expect(onSelectionLongPress).toHaveBeenCalledWith(position(1, 2));
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels the long-press when the finger strays past the slop distance', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionLongPress = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionLongPress={onSelectionLongPress}
          snapshot={buildSnapshot({ x: 0, y: 0 })}
          {...FONT}
        />
      );
      const overlay = screen.getByTestId('terminal-selection-overlay');
      await fireEvent(overlay, 'touchStart', touchStartEvent(25, 20));
      await fireEvent(overlay, 'touchMove', touchMoveEvent(45, 20));
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.longPressMs);
      });
      expect(onSelectionLongPress).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels the long-press when the touch ends or a drag starts', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionLongPress = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionLongPress={onSelectionLongPress}
          snapshot={buildSnapshot({ x: 0, y: 0 })}
          {...FONT}
        />
      );
      const overlay = screen.getByTestId('terminal-selection-overlay');
      await fireEvent(overlay, 'touchStart', touchStartEvent(25, 20));
      await fireEvent(overlay, 'touchEnd', {});
      await fireEvent(overlay, 'touchStart', touchStartEvent(25, 20));
      await fireEvent(screen.getByTestId('terminal-scroll'), 'scrollBeginDrag', {});
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.longPressMs);
      });
      expect(onSelectionLongPress).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores multi-touch long-presses', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionLongPress = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionLongPress={onSelectionLongPress}
          snapshot={buildSnapshot({ x: 0, y: 0 })}
          {...FONT}
        />
      );
      await fireEvent(
        screen.getByTestId('terminal-selection-overlay'),
        'touchStart',
        touchStartEvent(25, 20, 2)
      );
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.longPressMs);
      });
      expect(onSelectionLongPress).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('TerminalView selection auto-scroll', () => {
  it('scrolls a row per tick and extends a follow-mode selection at the bottom edge', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(5, 0), position(5, 3))}
          selectionMoveMode="follow"
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      driveSelectionDrag(screen.getByTestId('terminal-selection-overlay'), { x: 30, y: 100 }, { dx: 0, dy: 70 });
      expect(onSelectionMove).toHaveBeenNthCalledWith(1, position(5, 3));
      expect(onSelectionMove).toHaveBeenNthCalledWith(2, position(9, 3));

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      expect(onSelectionMove).toHaveBeenNthCalledWith(3, position(10, 3));
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      expect(onSelectionMove).toHaveBeenNthCalledWith(4, position(11, 3));
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops auto-scrolling when the drag releases at the edge', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(5, 0), position(5, 3))}
          selectionMoveMode="follow"
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      const overlay = screen.getByTestId('terminal-selection-overlay');
      driveSelectionDrag(overlay, { x: 30, y: 100 }, { dx: 0, dy: 70 });
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      overlay.props.onResponderRelease({});
      const callCountAfterRelease = onSelectionMove.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 6);
      });
      expect(onSelectionMove.mock.calls.length).toBe(callCountAfterRelease);
      expect(onSelectionMove).toHaveBeenLastCalledWith(position(10, 3));
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops auto-scrolling when the marker is dragged back mid-screen', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(5, 0), position(5, 3))}
          selectionMoveMode="follow"
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      const overlay = screen.getByTestId('terminal-selection-overlay');
      const grant = { x: 30, y: 100 };
      driveSelectionDrag(overlay, grant, { dx: 0, dy: 70 });
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      driveSelectionMoveTo(overlay, { x: grant.x, y: grant.y + 70 }, grant);

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 6);
      });
      expect(onSelectionMove).toHaveBeenLastCalledWith(position(6, 3));
      expect(onSelectionMove.mock.calls.length).toBe(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stacks the finger delta on the scrolled rows in relative mode', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(8, 0), position(8, 3))}
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      const overlay = screen.getByTestId('terminal-selection-overlay');
      const grant = { x: 30, y: 100 };
      driveSelectionDrag(overlay, grant, { dx: 0, dy: FONT.lineHeight });
      expect(onSelectionMove).toHaveBeenNthCalledWith(1, position(9, 0));

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      expect(onSelectionMove).toHaveBeenNthCalledWith(2, position(10, 0));
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      expect(onSelectionMove).toHaveBeenNthCalledWith(3, position(11, 0));

      driveSelectionMoveTo(overlay, { x: grant.x, y: grant.y + FONT.lineHeight }, {
        x: grant.x,
        y: grant.y + FONT.lineHeight * 2 + 2,
      });
      expect(onSelectionMove).toHaveBeenNthCalledWith(4, position(12, 0));
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops extending once the bottom of the content is reached', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(5, 0), position(5, 3))}
          selectionMoveMode="follow"
          snapshot={buildTallSnapshot(12)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 12 * FONT.lineHeight, viewportHeightPx: 180 });
      driveSelectionDrag(screen.getByTestId('terminal-selection-overlay'), { x: 30, y: 100 }, { dx: 0, dy: 70 });

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 3);
      });
      expect(onSelectionMove).toHaveBeenLastCalledWith(position(11, 3));
      const callCountAtContentEnd = onSelectionMove.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 6);
      });
      expect(onSelectionMove.mock.calls.length).toBe(callCountAtContentEnd);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never auto-scrolls the remote surface during selection', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      const onScrollRows = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onScrollRows={onScrollRows}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(0, 0), position(0, 3))}
          selectionMoveMode="follow"
          snapshot={buildSnapshot({ x: 0, y: 0 }, true)}
          {...FONT}
        />
      );
      driveSelectionDrag(screen.getByTestId('terminal-selection-overlay'), { x: 25, y: 20 }, { dx: 0, dy: 16 });

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 6);
      });
      expect(onSelectionMove).toHaveBeenCalledTimes(2);
      expect(onScrollRows).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('scrolls the surface up to an off-screen relative marker before extending again', async () => {
    jest.useFakeTimers();
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(8, 0), position(8, 3))}
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      const overlay = screen.getByTestId('terminal-selection-overlay');
      driveSelectionDrag(overlay, { x: 30, y: 100 }, { dx: 0, dy: 7 * FONT.lineHeight });
      expect(onSelectionMove).toHaveBeenNthCalledWith(1, position(15, 0));

      // The marker sits five rows past the bottom edge band; catch-up ticks
      // scroll without emitting until the marker reaches the edge again.
      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 6);
      });
      expect(onSelectionMove).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs);
      });
      expect(onSelectionMove).toHaveBeenNthCalledWith(2, position(16, 0));
    } finally {
      jest.useRealTimers();
    }
  });

  it('scrolls the surface to reveal a switched-to marker outside the viewport', async () => {
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo');
    try {
      const rerenderView = await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          selection={selectionState(position(30, 0), position(5, 3), 'to')}
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      await rerenderView.rerender(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          selection={selectionState(position(30, 0), position(5, 3), 'from')}
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      expect(scrollToSpy).toHaveBeenCalledWith({ animated: true, y: 396 });
    } finally {
      scrollToSpy.mockRestore();
    }
  });

  it('reveals a relative-mode marker flung past the viewport once the drag releases', async () => {
    jest.useFakeTimers();
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo');
    try {
      const onSelectionMove = jest.fn();
      await render(
        <TerminalView
          charWidthPx={10}
          isCursorVisible={false}
          onSelectionMove={onSelectionMove}
          selection={selectionState(position(8, 0), position(8, 3))}
          snapshot={buildTallSnapshot(40)}
          {...FONT}
        />
      );
      primeScrollViewMetrics({ contentHeightPx: 40 * FONT.lineHeight, viewportHeightPx: 180 });
      const overlay = screen.getByTestId('terminal-selection-overlay');
      driveSelectionDrag(overlay, { x: 30, y: 100 }, { dx: 0, dy: 7 * FONT.lineHeight });
      expect(onSelectionMove).toHaveBeenCalledTimes(1);

      overlay.props.onResponderRelease({});
      expect(scrollToSpy).toHaveBeenCalledWith({ animated: true, y: 126 });

      await act(async () => {
        jest.advanceTimersByTime(constant.terminal.gesture.autoScrollIntervalMs * 6);
      });
      expect(onSelectionMove).toHaveBeenCalledTimes(1);
    } finally {
      scrollToSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe('revealScrollOffsetOf', () => {
  const revealOffsetOf = (params: { markerLine: number; offsetPx?: number; contentHeightPx?: number }) => {
    return terminalViewUtil.revealScrollOffsetOf({
      contentHeightPx: params.contentHeightPx ?? 40 * FONT.lineHeight,
      lineHeight: FONT.lineHeight,
      markerLine: params.markerLine,
      offsetPx: params.offsetPx ?? 0,
      snapshot: buildTallSnapshot(40),
      viewportHeightPx: 180,
    });
  };

  it('returns null while the marker row is already on screen', () => {
    expect(revealOffsetOf({ markerLine: 0 })).toBeNull();
    expect(revealOffsetOf({ markerLine: 9 })).toBeNull();
    expect(revealOffsetOf({ markerLine: 0, offsetPx: 10 })).toBeNull();
  });

  it('returns null without a measurable viewport or line height', () => {
    expect(
      terminalViewUtil.revealScrollOffsetOf({
        contentHeightPx: 720,
        lineHeight: FONT.lineHeight,
        markerLine: 30,
        offsetPx: 0,
        snapshot: buildTallSnapshot(40),
        viewportHeightPx: 0,
      })
    ).toBeNull();
    expect(
      terminalViewUtil.revealScrollOffsetOf({
        contentHeightPx: 720,
        lineHeight: 0,
        markerLine: 30,
        offsetPx: 0,
        snapshot: buildTallSnapshot(40),
        viewportHeightPx: 180,
      })
    ).toBeNull();
  });

  it('targets the second row from the top for markers above the window', () => {
    expect(revealOffsetOf({ markerLine: 2, offsetPx: 90 })).toBe(18);
  });

  it('targets the second row from the bottom for markers below the window', () => {
    expect(revealOffsetOf({ markerLine: 25 })).toBe(306);
  });

  it('clamps the target within the scrollable range', () => {
    expect(revealOffsetOf({ markerLine: 39 })).toBe(40 * FONT.lineHeight - 180);
    expect(revealOffsetOf({ markerLine: 0, offsetPx: 54 })).toBe(0);
  });
});

describe('selectionPositionFromPoint', () => {
  it('maps content-space points to rows and columns in local scroll mode', () => {
    expect(
      terminalViewUtil.selectionPositionFromPoint({
        charWidthPx: 10,
        lineHeight: 18,
        pointX: 25,
        pointY: 20,
        scrollbackCount: 0,
        snapshot: buildSnapshot({ x: 0, y: 0 }),
      })
    ).toEqual(position(1, 2));
  });

  it('offsets by the hidden scrollback rows in remote scroll mode', () => {
    expect(
      terminalViewUtil.selectionPositionFromPoint({
        charWidthPx: 10,
        lineHeight: 18,
        pointX: 0,
        pointY: 0,
        scrollbackCount: 2,
        snapshot: buildScrollbackSnapshot(),
      })
    ).toEqual(position(2, 0));
  });

  it('honors an absolute firstLine offset', () => {
    const snapshot = { ...buildSnapshot({ x: 0, y: 0 }), firstLine: 40 };
    expect(
      terminalViewUtil.selectionPositionFromPoint({
        charWidthPx: 10,
        lineHeight: 18,
        pointX: 0,
        pointY: 0,
        scrollbackCount: 0,
        snapshot,
      })
    ).toEqual(position(40, 0));
  });

  it('clamps points beyond the rendered rows onto the last row', () => {
    expect(
      terminalViewUtil.selectionPositionFromPoint({
        charWidthPx: 10,
        lineHeight: 18,
        pointX: 999,
        pointY: 5000,
        scrollbackCount: 0,
        snapshot: buildSnapshot({ x: 0, y: 0 }),
      })
    ).toEqual(position(1, 99));
  });

  it('never divides by a non-positive cell size', () => {
    expect(
      terminalViewUtil.selectionPositionFromPoint({
        charWidthPx: 0,
        lineHeight: 0,
        pointX: 100,
        pointY: 100,
        scrollbackCount: 0,
        snapshot: buildSnapshot({ x: 0, y: 0 }),
      })
    ).toEqual(position(0, 0));
  });
});

describe('splitRowForCursor', () => {
  it('inverts the cell at the cursor column inside the row content', () => {
    const segments = terminalViewUtil.splitRowForCursor({
      cursorColumn: 1,
      row: { segments: [segment({ text: 'abc' })] },
    });
    expect(segments).toEqual([
      segment({ text: 'a' }),
      segment({ inverse: true, text: 'b' }),
      segment({ text: 'c' }),
    ]);
  });

  it('pads trailing blanks so the cursor block lands on its column past the content', () => {
    const segments = terminalViewUtil.splitRowForCursor({
      cursorColumn: 5,
      row: { segments: [segment({ text: 'ab' })] },
    });
    expect(segments).toEqual([
      segment({ text: 'ab' }),
      segment({ text: '   ' }),
      segment({ inverse: true, text: ' ' }),
    ]);
  });

  it('appends the cursor cell directly when it sits at the end of the content', () => {
    const segments = terminalViewUtil.splitRowForCursor({
      cursorColumn: 2,
      row: { segments: [segment({ text: 'ab' })] },
    });
    expect(segments).toEqual([segment({ text: 'ab' }), segment({ inverse: true, text: ' ' })]);
  });
});

describe('splitRowForSelection', () => {
  const rowSelection = (startColumn: number, endColumn: number) => {
    return {
      activeMarker: 'from' as const,
      endColumn,
      fromMarkerColumn: startColumn,
      startColumn,
      toMarkerColumn: endColumn,
    };
  };

  it('splits segments into colored pieces at the selection bounds', () => {
    const pieces = terminalViewUtil.splitRowForSelection({
      segments: [segment({ text: 'hello ' }), segment({ text: 'red' })],
      selection: rowSelection(2, 6),
    });
    expect(pieces.map((piece) => {
      return { backgroundColor: piece.backgroundColor, text: piece.segment.text };
    })).toEqual([
      { backgroundColor: null, text: 'he' },
      { backgroundColor: constant.terminal.selection.fromActiveBg, text: 'l' },
      { backgroundColor: constant.terminal.selection.bg, text: 'lo ' },
      { backgroundColor: constant.terminal.selection.toBg, text: 'r' },
      { backgroundColor: null, text: 'ed' },
    ]);
  });

  it('paints the marker cells on a full-row selection', () => {
    const pieces = terminalViewUtil.splitRowForSelection({
      segments: [segment({ text: 'abc' })],
      selection: rowSelection(0, 2),
    });
    expect(pieces.map((piece) => {
      return { backgroundColor: piece.backgroundColor, text: piece.segment.text };
    })).toEqual([
      { backgroundColor: constant.terminal.selection.fromActiveBg, text: 'a' },
      { backgroundColor: constant.terminal.selection.bg, text: 'b' },
      { backgroundColor: constant.terminal.selection.toBg, text: 'c' },
    ]);
  });
});
