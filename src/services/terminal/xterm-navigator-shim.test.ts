type NavigatorStrings = {
  userAgent?: string;
  platform?: string;
};

const readNavigator = (): NavigatorStrings | undefined => {
  return (globalThis as { navigator?: NavigatorStrings }).navigator;
};

describe('xterm-navigator-shim', () => {
  it('defines navigator.userAgent and navigator.platform when they are missing', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    Object.defineProperty(globalThis, 'navigator', {
      value: { product: 'ReactNative' },
      writable: true,
      configurable: true,
    });

    try {
      expect(readNavigator()?.userAgent).toBeUndefined();
      expect(readNavigator()?.platform).toBeUndefined();

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/services/terminal/xterm-navigator-shim');
      });

      expect(readNavigator()?.userAgent).toBe('ReactNative');
      expect(readNavigator()?.platform).toBe('ReactNative');
    } finally {
      if (originalDescriptor !== undefined) {
        Object.defineProperty(globalThis, 'navigator', originalDescriptor);
      } else {
        delete (globalThis as { navigator?: NavigatorStrings }).navigator;
      }
    }
  });
});
