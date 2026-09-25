import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { usePinchFontSize } from '@/features/terminal/use-pinch-font-size';
import type { FontSizeStepDirection } from '@/services/terminal/terminal-preference';

type PinchHarnessProps = {
  onStep: (params: { direction: FontSizeStepDirection }) => void;
};

const PinchHarness = ({ onStep }: PinchHarnessProps) => {
  const panHandlers = usePinchFontSize({ onStep });

  return <View testID="pinch-surface" {...panHandlers} />;
};

const renderPinchSurface = async (onStep: jest.Mock) => {
  await render(<PinchHarness onStep={onStep} />);

  return screen.getByTestId('pinch-surface');
};

// PanResponder drops move events whose touchHistory timestamp was already
// accounted for, so every synthetic event needs a fresh, increasing timestamp.
const touchEventSequence = { timeStamp: 100 };

const nextTimeStamp = () => {
  touchEventSequence.timeStamp += 1;

  return touchEventSequence.timeStamp;
};

const touchAt = (pageX: number, pageY: number, timeStamp: number) => {
  return {
    currentTimeStamp: timeStamp,
    currentPageX: pageX,
    currentPageY: pageY,
    previousPageX: pageX,
    previousPageY: pageY,
    touchActive: true,
  };
};

const pinchEvent = (spreadPx: number) => {
  const timeStamp = nextTimeStamp();

  return {
    nativeEvent: {
      touches: [
        { pageX: 0, pageY: 0 },
        { pageX: spreadPx, pageY: 0 },
      ],
    },
    touchHistory: {
      indexOfSingleActiveTouch: -1,
      mostRecentTimeStamp: timeStamp,
      numberActiveTouches: 2,
      touchBank: [touchAt(0, 0, timeStamp), touchAt(spreadPx, 0, timeStamp)],
    },
  };
};

const singleTouchEvent = () => {
  const timeStamp = nextTimeStamp();

  return {
    nativeEvent: {
      touches: [{ pageX: 10, pageY: 10 }],
    },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timeStamp,
      numberActiveTouches: 1,
      touchBank: [touchAt(10, 10, timeStamp)],
    },
  };
};

describe('usePinchFontSize', () => {
  it('claims the responder only while two touches are active', async () => {
    const surface = await renderPinchSurface(jest.fn());

    expect(surface.props.onStartShouldSetResponderCapture(singleTouchEvent())).toBe(false);
    expect(surface.props.onMoveShouldSetResponderCapture(singleTouchEvent())).toBe(false);
    expect(surface.props.onStartShouldSetResponderCapture(pinchEvent(100))).toBe(true);
    expect(surface.props.onMoveShouldSetResponderCapture(pinchEvent(100))).toBe(true);
  });

  it('steps the font size up when the pinch spreads past the step-in ratio', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(125));

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith({ direction: 'up' });
  });

  it('steps the font size down when the pinch closes past the step-out ratio', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(78));

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith({ direction: 'down' });
  });

  it('does not step while the spread stays inside the ratio band', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(115));
    surface.props.onResponderMove(pinchEvent(83));

    expect(onStep).not.toHaveBeenCalled();
  });

  it('re-anchors after each step so one long pinch keeps stepping', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(125));
    surface.props.onResponderMove(pinchEvent(150));
    surface.props.onResponderMove(pinchEvent(100));

    expect(onStep.mock.calls).toEqual([
      [{ direction: 'up' }],
      [{ direction: 'up' }],
      [{ direction: 'down' }],
    ]);
  });

  it('ignores moves that lose a finger', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(singleTouchEvent());

    expect(onStep).not.toHaveBeenCalled();
  });

  it('ignores a pinch whose anchor spread is degenerate', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(0));
    surface.props.onResponderMove(pinchEvent(120));

    expect(onStep).not.toHaveBeenCalled();
  });

  it('resets the anchor when the gesture is released', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(125));
    surface.props.onResponderRelease({});
    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(115));

    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it('resets the anchor when the system terminates the responder', async () => {
    const onStep = jest.fn();
    const surface = await renderPinchSurface(onStep);

    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(125));
    surface.props.onResponderTerminate({});
    surface.props.onResponderGrant(pinchEvent(100));
    surface.props.onResponderMove(pinchEvent(90));

    expect(onStep).toHaveBeenCalledTimes(1);
  });
});
