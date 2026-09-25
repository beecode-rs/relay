import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { SshKeySettingsTab } from '@/features/settings/ssh-key-settings-tab';
import { deviceKeyService } from '@/services/connection/device-key';
import type { DeviceKeyInfo } from '@/services/connection/device-key';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

jest.mock('expo-clipboard', () => {
  return { setStringAsync: jest.fn(async () => { return true; }) };
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
      rename: jest.fn(),
      remove: jest.fn(),
    },
  };
});

const mockDeviceKeyInfo: DeviceKeyInfo = {
  comment: 'beecode@ios-1a2b3c',
  createdAt: '2026-01-01T00:00:00.000Z',
  fingerprint: 'SHA256:mock-device-key',
  privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----MOCK-----END OPENSSH PRIVATE KEY-----',
  publicKey: 'ssh-ed25519 AAAAMOCKDEVICEKEYBLOB beecode@ios-1a2b3c',
};

const mockRegeneratedKeyInfo: DeviceKeyInfo = {
  ...mockDeviceKeyInfo,
  comment: 'beecode@ios-9z8y7x',
  fingerprint: 'SHA256:mock-regenerated',
  publicKey: 'ssh-ed25519 AAAAMOCKREGENERATEDBLOB beecode@ios-9z8y7x',
};

const mockRenamedKeyInfo: DeviceKeyInfo = {
  ...mockDeviceKeyInfo,
  comment: 'Relay-beecode@My iPhone-ios',
  publicKey: 'ssh-ed25519 AAAAMOCKDEVICEKEYBLOB Relay-beecode@My iPhone-ios',
};

const createThemeStorage = (): ThemePreferenceStorage => {
  return {
    async readPreference() {
      return null;
    },
    async writePreference() {},
  };
};

const renderTab = () => {
  return render(
    <ThemePreferenceProvider storage={createThemeStorage()}>
      <PaperProvider>
        <SshKeySettingsTab />
      </PaperProvider>
    </ThemePreferenceProvider>,
  );
};

describe('SshKeySettingsTab', () => {
  beforeEach(() => {
    jest.mocked(deviceKeyService.find).mockReset();
    jest.mocked(deviceKeyService.find).mockResolvedValue(mockDeviceKeyInfo);
    jest.mocked(deviceKeyService.getOrCreate).mockReset();
    jest.mocked(deviceKeyService.regenerate).mockReset();
    jest.mocked(deviceKeyService.regenerate).mockResolvedValue(mockRegeneratedKeyInfo);
    jest.mocked(deviceKeyService.rename).mockReset();
    jest.mocked(deviceKeyService.remove).mockReset();
    jest.mocked(deviceKeyService.remove).mockResolvedValue(undefined);
    jest.mocked(Clipboard.setStringAsync).mockClear();
  });

  it('shows the key name and public key but never the private key', async () => {
    await renderTab();

    expect(await screen.findByText(mockDeviceKeyInfo.comment)).toBeTruthy();
    expect(screen.getByTestId('device-key-public-key').props.children).toBe(mockDeviceKeyInfo.publicKey);
    expect(screen.queryByText(mockDeviceKeyInfo.privateKey)).toBeNull();
    expect(screen.queryByText(/BEGIN OPENSSH PRIVATE KEY/)).toBeNull();
  });

  it('shows an empty state when no device key exists', async () => {
    jest.mocked(deviceKeyService.find).mockResolvedValue(null);
    await renderTab();

    expect(await screen.findByText('No device key on this device yet.')).toBeTruthy();
    expect(screen.getByText('Generate Device Key')).toBeTruthy();
    expect(screen.queryByTestId('device-key-copy-button')).toBeNull();
    expect(screen.queryByTestId('device-key-remove-button')).toBeNull();
  });

  it('shows an error when the device key cannot be read', async () => {
    jest.mocked(deviceKeyService.find).mockRejectedValue(new Error('keychain locked'));
    await renderTab();

    expect(await screen.findByText('Device key unavailable: keychain locked')).toBeTruthy();
  });

  it('copies the public key to the clipboard', async () => {
    await renderTab();

    await waitFor(() => {
      expect(screen.getByTestId('device-key-copy-button')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('device-key-copy-button'));

    await waitFor(() => {
      expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenCalledWith(mockDeviceKeyInfo.publicKey);
    });
    expect(screen.getByText('Public key copied to clipboard')).toBeTruthy();
  });

  it('generates the first key without a confirmation', async () => {
    jest.mocked(deviceKeyService.find).mockResolvedValue(null);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    try {
      await renderTab();

      await fireEvent.press(await screen.findByTestId('device-key-generate-button'));

      expect(alertSpy).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(deviceKeyService.regenerate).toHaveBeenCalledTimes(1);
      });
      expect(await screen.findByText(mockRegeneratedKeyInfo.comment)).toBeTruthy();
    } finally {
      alertSpy.mockRestore();
    }
  });

  it('regenerates the key after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    try {
      await renderTab();

      await waitFor(() => {
        expect(screen.getByText(mockDeviceKeyInfo.comment)).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('device-key-generate-button'));

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0]?.[0]).toBe('Generate new key');
      const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
      expect(buttons.map((button) => { return button.text; })).toEqual(['Cancel', 'Generate']);
      expect(buttons[1]?.style).toBe('destructive');
      buttons[1]?.onPress?.();

      await waitFor(() => {
        expect(screen.getByText(mockRegeneratedKeyInfo.comment)).toBeTruthy();
      });
      expect(deviceKeyService.regenerate).toHaveBeenCalledTimes(1);
      expect(deviceKeyService.getOrCreate).not.toHaveBeenCalled();
      expect(screen.getByTestId('device-key-public-key').props.children).toBe(mockRegeneratedKeyInfo.publicKey);
    } finally {
      alertSpy.mockRestore();
    }
  });

  it('renames the key from the rename dialog', async () => {
    jest.mocked(deviceKeyService.rename).mockResolvedValue(mockRenamedKeyInfo);
    await renderTab();

    await fireEvent.press(await screen.findByTestId('device-key-rename-button'));

    expect(screen.getByTestId('device-key-rename-input').props.value).toBe(mockDeviceKeyInfo.comment);
    await fireEvent.changeText(screen.getByTestId('device-key-rename-input'), mockRenamedKeyInfo.comment);
    await fireEvent.press(screen.getByTestId('device-key-rename-confirm'));

    await waitFor(() => {
      expect(deviceKeyService.rename).toHaveBeenCalledWith({ comment: mockRenamedKeyInfo.comment });
    });
    expect(await screen.findByText(mockRenamedKeyInfo.comment)).toBeTruthy();
    expect(screen.getByTestId('device-key-public-key').props.children).toBe(mockRenamedKeyInfo.publicKey);
  });

  it('keeps the key unchanged when the rename dialog is cancelled', async () => {
    await renderTab();

    await fireEvent.press(await screen.findByTestId('device-key-rename-button'));
    await fireEvent.changeText(screen.getByTestId('device-key-rename-input'), mockRenamedKeyInfo.comment);
    await fireEvent.press(screen.getByText('Cancel'));

    expect(deviceKeyService.rename).not.toHaveBeenCalled();
    expect(screen.getByText(mockDeviceKeyInfo.comment)).toBeTruthy();
  });

  it('removes the key after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    try {
      await renderTab();

      await waitFor(() => {
        expect(screen.getByTestId('device-key-remove-button')).toBeTruthy();
      });
      await fireEvent.press(screen.getByTestId('device-key-remove-button'));

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0]?.[0]).toBe('Remove device key');
      const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
      expect(buttons.map((button) => { return button.text; })).toEqual(['Cancel', 'Remove']);
      expect(buttons[1]?.style).toBe('destructive');
      buttons[1]?.onPress?.();

      expect(await screen.findByText('No device key on this device yet.')).toBeTruthy();
      expect(deviceKeyService.remove).toHaveBeenCalledTimes(1);
      expect(deviceKeyService.getOrCreate).not.toHaveBeenCalled();
    } finally {
      alertSpy.mockRestore();
    }
  });
});
