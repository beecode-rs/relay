import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { View } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { SecurityPreferenceProvider } from '@/components/security-preference-context';
import { TerminalPreferenceProvider } from '@/components/terminal-preference-context';
import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { biometricAuthService } from '@/services/security/biometric-auth-service';
import type { SecurityPreferenceStorage } from '@/services/security/security-preference';
import { deviceKeyService } from '@/services/connection/device-key';
import type { TerminalPreferenceStorage } from '@/services/terminal/terminal-preference';
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

jest.mock('@/services/connection/device-key', () => {
  return {
    deviceKeyService: {
      find: jest.fn(),
      getOrCreate: jest.fn(),
      regenerate: jest.fn(),
      remove: jest.fn(),
    },
  };
});

jest.mock('@/services/security/biometric-auth-service', () => {
  return {
    biometricAuthService: {
      authenticate: jest.fn(),
      isBiometricAvailable: jest.fn(),
    },
  };
});

const createStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const writes: string[] = [];
  const storage: ThemePreferenceStorage & { getWrites(): string[] } = {
    async readPreference() {
      return state.value;
    },
    async writePreference(params) {
      state.value = params.value;
      writes.push(params.value);
    },
    getWrites() {
      return writes;
    },
  };

  return storage;
};

const createTerminalStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const writes: string[] = [];
  const storage: TerminalPreferenceStorage & { getWrites(): string[] } = {
    async readPreference() {
      return state.value;
    },
    async writePreference(params) {
      state.value = params.value;
      writes.push(params.value);
    },
    getWrites() {
      return writes;
    },
  };

  return storage;
};

const createSecurityStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const writes: string[] = [];
  const storage: SecurityPreferenceStorage & { getWrites(): string[] } = {
    async readPreference() {
      return state.value;
    },
    async writePreference(params) {
      state.value = params.value;
      writes.push(params.value);
    },
    getWrites() {
      return writes;
    },
  };

  return storage;
};

const renderScreen = (
  storage: ThemePreferenceStorage,
  terminalStorage: TerminalPreferenceStorage = createTerminalStorage(),
  securityStorage: SecurityPreferenceStorage = createSecurityStorage(),
) => {
  return render(
    <ThemePreferenceProvider storage={storage}>
      <TerminalPreferenceProvider storage={terminalStorage}>
        <SecurityPreferenceProvider storage={securityStorage}>
          <PaperProvider>
            <View>
              <SettingsScreen />
            </View>
          </PaperProvider>
        </SecurityPreferenceProvider>
      </TerminalPreferenceProvider>
    </ThemePreferenceProvider>,
  );
};

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.mocked(biometricAuthService.isBiometricAvailable).mockReset();
    jest.mocked(biometricAuthService.isBiometricAvailable).mockResolvedValue(true);
  });

  it('renders the system tab with the color scheme row', async () => {
    await renderScreen(createStorage());

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('SSH Key')).toBeTruthy();
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Color scheme')).toBeTruthy();
    expect(screen.getByText('Auto follows your system setting')).toBeTruthy();
    expect(screen.getByTestId('theme-scheme-menu-anchor')).toBeTruthy();
  });

  it('renders the ssh key tab with the device key section', async () => {
    jest.mocked(deviceKeyService.find).mockResolvedValue(null);
    await renderScreen(createStorage());

    await fireEvent.press(screen.getByText('SSH Key'));

    expect(await screen.findByText('Device key')).toBeTruthy();
    expect(await screen.findByText('No device key on this device yet.')).toBeTruthy();
    expect(screen.getByText('Generate Device Key')).toBeTruthy();
  });

  it('renders the security tab with the biometric lock row defaulting to off', async () => {
    await renderScreen(createStorage());

    await fireEvent.press(screen.getByText('Security'));

    expect(await screen.findByText('App lock')).toBeTruthy();
    expect(await screen.findByText('Biometric lock')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('biometric-lock-switch').props.value).toBe(false);
    });
  });

  it('shows the persisted scheme as the selected label', async () => {
    await renderScreen(createStorage('dark'));

    await waitFor(() => {
      expect(screen.getByText('Dark')).toBeTruthy();
    });
  });

  it.each(['light', 'dark', 'system'] as const)('persists the scheme %s when selected', async (value) => {
    const storage = createStorage();
    await renderScreen(storage);

    await waitFor(() => {
      expect(screen.getByText('Auto')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('theme-scheme-menu-anchor'));
    await waitFor(() => {
      expect(screen.getByTestId(`theme-scheme-option-${value}`)).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId(`theme-scheme-option-${value}`));

    await waitFor(() => {
      expect(storage.getWrites()).toEqual([value]);
    });
  });

  it('navigates back from the top bar', async () => {
    await renderScreen(createStorage());

    await fireEvent.press(screen.getByTestId('app-top-bar-back'));

    expect(router.back).toHaveBeenCalled();
  });

  it('renders the terminal font size and selection rows', async () => {
    await renderScreen(createStorage());

    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(screen.getByText('Font size')).toBeTruthy();
    expect(screen.getByText('Selection follows finger')).toBeTruthy();
    expect(screen.getByTestId('terminal-font-size-menu-anchor')).toBeTruthy();
    expect(screen.getByTestId('selection-follow-finger-switch')).toBeTruthy();
  });

  it('persists a selected terminal font size', async () => {
    const terminalStorage = createTerminalStorage();
    await renderScreen(createStorage(), terminalStorage);

    await fireEvent.press(screen.getByTestId('terminal-font-size-menu-anchor'));
    await waitFor(() => {
      expect(screen.getByTestId('terminal-font-size-option-xl')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('terminal-font-size-option-xl'));

    await waitFor(() => {
      expect(terminalStorage.getWrites()).toEqual([JSON.stringify({ fontSize: 'xl', isSelectionFollowFingerEnabled: false })]);
    });
  });

  it('persists turning on the follow-finger selection mode', async () => {
    const terminalStorage = createTerminalStorage();
    await renderScreen(createStorage(), terminalStorage);

    await fireEvent(screen.getByTestId('selection-follow-finger-switch'), 'valueChange', true);

    await waitFor(() => {
      expect(terminalStorage.getWrites()).toEqual([
        JSON.stringify({ fontSize: 'm', isSelectionFollowFingerEnabled: true }),
      ]);
    });
  });
});
