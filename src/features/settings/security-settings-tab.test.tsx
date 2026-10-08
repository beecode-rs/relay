import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { SecurityPreferenceProvider } from '@/components/security-preference-context';
import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { SecuritySettingsTab } from '@/features/settings/security-settings-tab';
import { biometricAuthService } from '@/services/security/biometric-auth-service';
import type { SecurityPreferenceStorage } from '@/services/security/security-preference';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

jest.mock('react-native-paper', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('../../../jest/paper-menu-stub').createPaperModuleWithMenuStub();
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

const renderTab = (storage: SecurityPreferenceStorage = createSecurityStorage()) => {
  return render(
    <ThemePreferenceProvider storage={createThemeStorage()}>
      <SecurityPreferenceProvider storage={storage}>
        <PaperProvider>
          <SecuritySettingsTab />
        </PaperProvider>
      </SecurityPreferenceProvider>
    </ThemePreferenceProvider>,
  );
};

describe('SecuritySettingsTab', () => {
  beforeEach(() => {
    jest.mocked(biometricAuthService.isBiometricAvailable).mockReset();
    jest.mocked(biometricAuthService.isBiometricAvailable).mockResolvedValue(true);
    jest.mocked(biometricAuthService.authenticate).mockReset();
  });

  it('defaults the biometric lock to off', async () => {
    await renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('biometric-lock-switch').props.value).toBe(false);
    });
  });

  it('reflects a persisted enabled lock', async () => {
    await renderTab(createSecurityStorage('{"isBiometricLockEnabled":true}'));

    await waitFor(() => {
      expect(screen.getByTestId('biometric-lock-switch').props.value).toBe(true);
    });
  });

  it('persists turning the biometric lock on', async () => {
    const storage = createSecurityStorage();
    await renderTab(storage);

    await fireEvent(screen.getByTestId('biometric-lock-switch'), 'valueChange', true);

    await waitFor(() => {
      expect(storage.getWrites()).toEqual(['{"isBiometricLockEnabled":true}']);
    });
  });

  it('enables the lock after biometrics were enrolled without remounting', async () => {
    jest.mocked(biometricAuthService.isBiometricAvailable).mockReset();
    jest.mocked(biometricAuthService.isBiometricAvailable).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const storage = createSecurityStorage();
    await renderTab(storage);

    await fireEvent(screen.getByTestId('biometric-lock-switch'), 'valueChange', true);

    await waitFor(() => {
      expect(storage.getWrites()).toEqual(['{"isBiometricLockEnabled":true}']);
    });
  });

  it('persists turning the biometric lock off', async () => {
    const storage = createSecurityStorage('{"isBiometricLockEnabled":true}');
    await renderTab(storage);

    await waitFor(() => {
      expect(screen.getByTestId('biometric-lock-switch').props.value).toBe(true);
    });
    await fireEvent(screen.getByTestId('biometric-lock-switch'), 'valueChange', false);

    await waitFor(() => {
      expect(storage.getWrites()).toEqual(['{"isBiometricLockEnabled":false}']);
    });
  });

  it('describes the startup lock when biometrics are available', async () => {
    await renderTab();

    expect(await screen.findByText('Require fingerprint or face unlock when Relay starts')).toBeTruthy();
    expect(screen.queryByText(/Set up fingerprint or face unlock/)).toBeNull();
  });

  it('notifies that biometrics must be set up when enabling without enrollment', async () => {
    jest.mocked(biometricAuthService.isBiometricAvailable).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const storage = createSecurityStorage();
    try {
      await renderTab(storage);

      expect(
        await screen.findByText('Set up fingerprint or face unlock in your device settings to enable the lock'),
      ).toBeTruthy();
      await waitFor(() => {
        expect(screen.getByTestId('biometric-lock-switch').props.disabled).toBeFalsy();
      });
      await fireEvent(screen.getByTestId('biometric-lock-switch'), 'valueChange', true);

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0]?.[0]).toBe('Biometric lock unavailable');
      expect(alertSpy.mock.calls[0]?.[1]).toBe(
        'Fingerprint or face unlock is not set up on this device. Set it up in your device settings and try again.'
      );
      expect(storage.getWrites()).toEqual([]);
      expect(screen.getByTestId('biometric-lock-switch').props.value).toBe(false);
    } finally {
      alertSpy.mockRestore();
    }
  });
});
