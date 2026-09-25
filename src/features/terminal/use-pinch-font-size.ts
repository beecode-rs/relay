import { useEffect, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import type { GestureResponderEvent, GestureResponderHandlers } from 'react-native';

import { constant } from '@/constants/constant';
import type { FontSizeStepDirection } from '@/services/terminal/terminal-preference';

const PINCH_TOUCH_COUNT = 2;

type PinchStepListener = (params: { direction: FontSizeStepDirection }) => void;

type UsePinchFontSizeParams = {
  onStep: PinchStepListener;
};

const pinchDistanceOf = (event: GestureResponderEvent): number | null => {
  const [first, second] = event.nativeEvent.touches;
  if (first === undefined || second === undefined) {
    return null;
  }
  const deltaX = second.pageX - first.pageX;
  const deltaY = second.pageY - first.pageY;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

const resolveStepDirection = (params: { anchorDistancePx: number; distancePx: number }): FontSizeStepDirection | null => {
  const spreadRatio = params.distancePx / params.anchorDistancePx;
  if (spreadRatio >= constant.terminal.gesture.pinch.stepInRatio) {
    return 'up';
  }
  if (spreadRatio <= constant.terminal.gesture.pinch.stepOutRatio) {
    return 'down';
  }

  return null;
};

export function usePinchFontSize(params: UsePinchFontSizeParams): GestureResponderHandlers {
  const { onStep } = params;
  const onStepRef = useRef(onStep);
  const anchorDistanceRef = useRef<number | null>(null);
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers>({});

  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  useEffect(() => {
    // The responder rides on the terminal area above the scroll and selection
    // surfaces and only claims the capture phase while two touches are down,
    // so single-finger scrolling, long-press, and selection gestures keep
    // flowing to the terminal untouched.
    const responder = PanResponder.create({
      onMoveShouldSetPanResponderCapture: (event: GestureResponderEvent) => {
        return event.nativeEvent.touches.length >= PINCH_TOUCH_COUNT;
      },
      onPanResponderGrant: (event: GestureResponderEvent) => {
        anchorDistanceRef.current = pinchDistanceOf(event);
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        const anchorDistancePx = anchorDistanceRef.current;
        const distancePx = pinchDistanceOf(event);
        if (
          anchorDistancePx === null ||
          distancePx === null ||
          anchorDistancePx <= 0 ||
          distancePx <= 0
        ) {
          return;
        }
        const direction = resolveStepDirection({ anchorDistancePx, distancePx });
        if (direction === null) {
          return;
        }
        anchorDistanceRef.current = distancePx;
        onStepRef.current({ direction });
      },
      onPanResponderRelease: () => {
        anchorDistanceRef.current = null;
      },
      onPanResponderTerminate: () => {
        anchorDistanceRef.current = null;
      },
      onStartShouldSetPanResponderCapture: (event: GestureResponderEvent) => {
        return event.nativeEvent.touches.length >= PINCH_TOUCH_COUNT;
      },
    });
    setPanHandlers(responder.panHandlers);
  }, []);

  return panHandlers;
}
