import { fireEvent, render, screen } from '@testing-library/react-native';
import { PaperProvider, Text } from 'react-native-paper';

import { BiometricLockGate } from '@/components/biometric-lock-gate';
import { SecurityPreferenceProvider } from '@/components/security-preference-context';
import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { biometricAuthService } from '@/services/security/biometric-auth-service';
import type { SecurityPreferenceStorage } from '@/services/security/security-preference';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

jest.mock('react-native-paper', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('../../jest/paper-menu-stub').createPaperModuleWithMenuStub();
});

jest.mock('@/services/security/biometric-auth-service', () => {
  return {
    biometricAuthService: {
      authenticate: jest.fn(),
      isBiometricAvailable: jest.fn(),
    },
  };
});

const createThemeStorage = (): ThemePreferenceStorage => {
  return {
    async readPreference() {
      return null;
    },
    async writePreference() {},
  };
};

const createSecurityStorage = (initialValue: string | null = null): SecurityPreferenceStorage => {
  return {
    async readPreference() {
      return initialValue;
    },
    async writePreference() {},
  };
};

const renderGate = (storage: SecurityPreferenceStorage = createSecurityStorage()) => {
  return render(
    <ThemePreferenceProvider storage={createThemeStorage()}>
      <SecurityPreferenceProvider storage={storage}>
        <PaperProvider>
          <BiometricLockGate>
            <Text testID="gate-children">Unlocked content</Text>
          </BiometricLockGate>
        </PaperProvider>
      </SecurityPreferenceProvider>
    </ThemePreferenceProvider>,
  );
};

describe('BiometricLockGate', () => {
  beforeEach(() => {
    jest.mocked(biometricAuthService.isBiometricAvailable).mockReset();
    jest.mocked(biometricAuthService.isBiometricAvailable).mockResolvedValue(true);
    jest.mocked(biometricAuthService.authenticate).mockReset();
    jest.mocked(biometricAuthService.authenticate).mockResolvedValue(true);
  });

  it('renders the app without authenticating when the lock is off', async () => {
    await renderGate();

    expect(await screen.findByText('Unlocked content')).toBeTruthy();
    expect(biometricAuthService.authenticate).not.toHaveBeenCalled();
  });

  it('authenticates at startup and renders the app on success', async () => {
    await renderGate(createSecurityStorage('{"isBiometricLockEnabled":true}'));

    expect(await screen.findByText('Unlocked content')).toBeTruthy();
    expect(biometricAuthService.authenticate).toHaveBeenCalledTimes(1);
    expect(biometricAuthService.authenticate).toHaveBeenCalledWith({ promptMessage: 'Unlock Relay' });
  });

  it('shows the lock overlay and retries after a cancelled prompt', async () => {
    jest.mocked(biometricAuthService.authenticate).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await renderGate(createSecurityStorage('{"isBiometricLockEnabled":true}'));

    expect(await screen.findByText('Relay is locked')).toBeTruthy();
    expect(screen.queryByText('Unlocked content')).toBeNull();

    await fireEvent.press(screen.getByTestId('biometric-unlock-button'));

    expect(await screen.findByText('Unlocked content')).toBeTruthy();
    expect(biometricAuthService.authenticate).toHaveBeenCalledTimes(2);
  });

  it('renders the app without authenticating when biometrics are unavailable', async () => {
    jest.mocked(biometricAuthService.isBiometricAvailable).mockResolvedValue(false);
    await renderGate(createSecurityStorage('{"isBiometricLockEnabled":true}'));

    expect(await screen.findByText('Unlocked content')).toBeTruthy();
    expect(biometricAuthService.authenticate).not.toHaveBeenCalled();
  });
});
