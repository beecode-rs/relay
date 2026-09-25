import '@/app-boot/boot';

import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { type JSX, useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PaperProvider } from 'react-native-paper';

import { useAppFonts } from '@/app-boot/use-app-fonts';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { TerminalPreferenceProvider } from '@/components/terminal-preference-context';
import { ThemePreferenceProvider, useThemePreference } from '@/components/theme/theme-context';
import { deviceKeyService } from '@/services/connection/device-key';

SplashScreen.preventAutoHideAsync();

const ThemedAppRoot = (): JSX.Element => {
  const { md3Theme, navigationTheme } = useThemePreference();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(md3Theme.colors.background);
  }, [md3Theme]);

  return (
    <PaperProvider theme={md3Theme}>
      <ThemeProvider value={navigationTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="connect" options={{ title: 'Server' }} />
          <Stack.Screen name="terminal" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="about" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </PaperProvider>
  );
};

export default function RootLayout() {
  const { isFontsLoaded } = useAppFonts();

  useEffect(() => {
    void deviceKeyService.find().catch((error) => {
      console.warn('[device-key] boot check failed:', error);
    });
  }, []);

  if (!isFontsLoaded) {
    return null;
  }

  return (
    <KeyboardProvider>
      <ThemePreferenceProvider>
        <TerminalPreferenceProvider>
          <ThemedAppRoot />
        </TerminalPreferenceProvider>
      </ThemePreferenceProvider>
    </KeyboardProvider>
  );
}
