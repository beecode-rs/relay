import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { AboutScreen } from '@/features/about/about-screen';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

jest.mock('expo-router', () => {
  return {
    router: { back: jest.fn(), navigate: jest.fn(), push: jest.fn() },
  };
});

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('react-native-safe-area-context/jest/mock').default;
});

jest.mock('react-native-paper', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('../../../jest/paper-menu-stub').createPaperModuleWithMenuStub();
});

const createStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const storage: ThemePreferenceStorage = {
    async readPreference() {
      return state.value;
    },
    async writePreference(params) {
      state.value = params.value;
    },
  };

  return storage;
};

const renderScreen = (storage: ThemePreferenceStorage) => {
  return render(
    <ThemePreferenceProvider storage={storage}>
      <PaperProvider>
        <View>
          <AboutScreen />
        </View>
      </PaperProvider>
    </ThemePreferenceProvider>,
  );
};

describe('AboutScreen', () => {
  it('renders the app details', async () => {
    await renderScreen(createStorage());

    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByTestId('about-app-logo')).toBeTruthy();
    expect(screen.getByText('Relay')).toBeTruthy();
    expect(screen.getByText('SSH terminal for mobile')).toBeTruthy();
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByText('1.0.0')).toBeTruthy();
    expect(screen.getByText('Expo SDK')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText('Made by beecode')).toBeTruthy();
    expect(screen.getByText('beecode.rs')).toBeTruthy();
    expect(screen.getByTestId('about-beecode-logo')).toBeTruthy();
  });

  it('navigates back from the top bar', async () => {
    await renderScreen(createStorage());

    await fireEvent.press(screen.getByTestId('app-top-bar-back'));

    expect(router.back).toHaveBeenCalled();
  });

  it('opens the beecode website from the made by section', async () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderScreen(createStorage());

    await fireEvent.press(screen.getByTestId('about-beecode-link'));

    expect(openUrlSpy).toHaveBeenCalledWith('https://beecode.rs');
  });
});
