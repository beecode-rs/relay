import { type Theme } from 'expo-router';
import { Platform } from 'react-native';
import type { MD3Theme } from 'react-native-paper';

import type { ThemeColor } from '@/constants/theme';
import type { EffectiveThemeScheme } from '@/services/theme/theme-preference';
import { PaperTheme } from '@/components/theme/paper-theme';

export type ThemedColor = ThemeColor;

const WEB_FONT_STACK =
  'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

const NAVIGATION_THEME_FONTS: Theme['fonts'] = Platform.select<Theme['fonts']>({
  default: {
    regular: { fontFamily: 'sans-serif', fontWeight: 'normal' },
    medium: { fontFamily: 'sans-serif-medium', fontWeight: 'normal' },
    bold: { fontFamily: 'sans-serif', fontWeight: '600' },
    heavy: { fontFamily: 'sans-serif', fontWeight: '700' },
  },
  ios: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
  web: {
    regular: { fontFamily: WEB_FONT_STACK, fontWeight: '400' },
    medium: { fontFamily: WEB_FONT_STACK, fontWeight: '500' },
    bold: { fontFamily: WEB_FONT_STACK, fontWeight: '600' },
    heavy: { fontFamily: WEB_FONT_STACK, fontWeight: '700' },
  },
});

export const effectiveThemeUtil = {
  resolveMd3Theme(params: { scheme: EffectiveThemeScheme }): MD3Theme {
    switch (params.scheme) {
      case 'dark':
        return PaperTheme.dark;
      case 'light':
        return PaperTheme.light;
      default:
        return PaperTheme.light;
    }
  },

  resolveNavigationTheme(params: { md3Theme: MD3Theme; scheme: EffectiveThemeScheme }): Theme {
    return {
      colors: {
        background: params.md3Theme.colors.background,
        border: params.md3Theme.colors.outlineVariant,
        card: params.md3Theme.colors.surface,
        notification: params.md3Theme.colors.error,
        primary: params.md3Theme.colors.primary,
        text: params.md3Theme.colors.onSurface,
      },
      dark: params.scheme === 'dark',
      fonts: NAVIGATION_THEME_FONTS,
    };
  },

  resolveThemedColor(params: { color: ThemedColor; md3Theme: MD3Theme }): string {
    switch (params.color) {
      case 'background':
        return params.md3Theme.colors.background;
      case 'backgroundElement':
        return params.md3Theme.colors.surfaceVariant;
      case 'backgroundSelected':
        return params.md3Theme.colors.secondaryContainer;
      case 'text':
        return params.md3Theme.colors.onSurface;
      case 'textSecondary':
        return params.md3Theme.colors.onSurfaceVariant;
      default:
        return params.md3Theme.colors.onSurface;
    }
  },
};
