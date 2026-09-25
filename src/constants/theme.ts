
import '@/global.css';

import { Platform } from 'react-native';

export const BlueRamp = {
  blue100: '#DBE6FF',
  blue300: '#A5C8FF',
  blue700: '#1D4ED8',
  blue900: '#0B2E8F',
  blue950: '#1E3A8A',
} as const;

export const GrayRamp = {
  black: '#000000',
  gray100: '#F0F0F3',
  gray200: '#E0E1E6',
  gray300: '#B0B4BA',
  gray500: '#60646C',
  gray700: '#2E3135',
  gray800: '#212225',
  white: '#ffffff',
} as const;

export const Colors = {
  light: {
    text: GrayRamp.black,
    background: GrayRamp.white,
    backgroundElement: GrayRamp.gray100,
    backgroundSelected: GrayRamp.gray200,
    textSecondary: GrayRamp.gray500,
  },
  dark: {
    text: GrayRamp.white,
    background: GrayRamp.black,
    backgroundElement: GrayRamp.gray800,
    backgroundSelected: GrayRamp.gray700,
    textSecondary: GrayRamp.gray300,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
