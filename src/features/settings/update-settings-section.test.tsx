import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { UpdateCheckProvider } from '@/components/update-check-context';
import { UpdateSettingsSection } from '@/features/settings/update-settings-section';
import type { AppUpdate, AppUpdateError, AppUpdateFetchResult, GithubRelease } from '@/services/update/app-update';
import { AppUpdateService } from '@/services/update/app-update-service';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

const APK_DOWNLOAD_URL = 'https://github.com/beecode-rs/relay/releases/download/v9.9.9/Relay-v9.9.9-android.apk';
const RELEASE_PAGE_URL = 'https://github.com/beecode-rs/relay/releases/tag/v9.9.9';
const RATE_LIMIT_RESET_EPOCH_SECONDS = 1799999520;

const LATEST_RELEASE: GithubRelease = {
  assets: [{ browserDownloadUrl: APK_DOWNLOAD_URL, name: 'Relay-v9.9.9-android.apk' }],
  downloadPageUrl: RELEASE_PAGE_URL,
  tagName: 'v9.9.9',
};

const AVAILABLE_UPDATE: AppUpdate = {
  apkDownloadUrl: APK_DOWNLOAD_URL,
  downloadPageUrl: RELEASE_PAGE_URL,
  tagName: 'v9.9.9',
};

const RATE_LIMITED_ERROR: AppUpdateError = {
  kind: 'rateLimited',
  message: 'GitHub API rate limit exceeded',
  resetAtEpochSeconds: RATE_LIMIT_RESET_EPOCH_SECONDS,
};

const formatExpectedResetTime = (): string => {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', hour12: false, minute: '2-digit' }).format(
    new Date(RATE_LIMIT_RESET_EPOCH_SECONDS * 1000),
  );
};

const toFetchError = (error: AppUpdateError): AppUpdateFetchResult => {
  return { error, release: null };
};

const createThemeStorage = (): ThemePreferenceStorage => {
  return {
    async readPreference() {
      return null;
    },
    async writePreference() {
      return;
    },
  };
};

const createStubService = () => {
  const service = new AppUpdateService({
    fetchResponse: () => {
      return Promise.resolve({ headers: { get: () => null }, json: () => Promise.resolve({}), ok: true, status: 200 });
    },
  });
  const fetchLatestRelease = jest
    .spyOn(service, 'fetchLatestRelease')
    .mockResolvedValue({ error: null, release: LATEST_RELEASE });
  const resolveUpdate = jest.spyOn(service, 'resolveUpdate').mockReturnValue(undefined);
  const resolveDownloadUrl = jest
    .spyOn(service, 'resolveDownloadUrl')
    .mockReturnValue(RELEASE_PAGE_URL);

  return { fetchLatestRelease, resolveDownloadUrl, resolveUpdate, service };
};

const renderSection = (service: AppUpdateService) => {
  return render(
    <ThemePreferenceProvider storage={createThemeStorage()}>
      <UpdateCheckProvider service={service}>
        <PaperProvider>
          <View>
            <UpdateSettingsSection />
          </View>
        </PaperProvider>
      </UpdateCheckProvider>
    </ThemePreferenceProvider>,
  );
};

const expectManualCheckDescription = async (params: {
  description: string;
  error: AppUpdateError;
}): Promise<void> => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const stub = createStubService();
  await renderSection(stub.service);
  await waitFor(() => {
    expect(screen.getByText('You are on the latest version')).toBeTruthy();
  });

  stub.fetchLatestRelease.mockResolvedValue(toFetchError(params.error));
  await fireEvent.press(screen.getByTestId('update-check-button'));

  await waitFor(() => {
    expect(screen.getByText(params.description)).toBeTruthy();
  });
  consoleErrorSpy.mockRestore();
};

describe('UpdateSettingsSection', () => {
  it('renders the check for updates row', async () => {
    const stub = createStubService();
    await renderSection(stub.service);

    expect(screen.getByText('Updates')).toBeTruthy();
    expect(screen.getByText('Check for updates')).toBeTruthy();
    expect(screen.getByTestId('update-check-button')).toBeTruthy();
  });

  it('checks automatically on mount and shows the up to date status', async () => {
    const stub = createStubService();
    await renderSection(stub.service);

    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });
    expect(stub.fetchLatestRelease).toHaveBeenCalledTimes(1);
  });

  it('checks again when the button is pressed', async () => {
    const stub = createStubService();
    await renderSection(stub.service);
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('update-check-button'));

    await waitFor(() => {
      expect(stub.fetchLatestRelease).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });
  });

  it('shows the checking status while a manual check is in flight', async () => {
    const stub = createStubService();
    await renderSection(stub.service);
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });

    let resolveFetch: ((result: AppUpdateFetchResult) => void) | undefined;
    stub.fetchLatestRelease.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });
    await fireEvent.press(screen.getByTestId('update-check-button'));

    await waitFor(() => {
      expect(screen.getByText('Contacting GitHub releases')).toBeTruthy();
    });
    expect(screen.getByTestId('update-check-button').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      resolveFetch?.({ error: null, release: LATEST_RELEASE });
    });
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });
  });

  it('offers the download and opens the resolved url when an update is available', async () => {
    const stub = createStubService();
    stub.resolveUpdate.mockReturnValue(AVAILABLE_UPDATE);
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderSection(stub.service);

    await waitFor(() => {
      expect(screen.getByText('Version v9.9.9 is available')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('update-check-button'));

    await waitFor(() => {
      expect(openUrlSpy).toHaveBeenCalledWith(RELEASE_PAGE_URL);
    });
    expect(stub.resolveDownloadUrl).toHaveBeenCalledWith({ platform: expect.any(String), update: AVAILABLE_UPDATE });
  });

  it('shows the rate limit message with the reset time when a manual check is rate limited', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const stub = createStubService();
    await renderSection(stub.service);
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });

    stub.fetchLatestRelease.mockResolvedValue(toFetchError(RATE_LIMITED_ERROR));
    await fireEvent.press(screen.getByTestId('update-check-button'));

    await waitFor(() => {
      expect(
        screen.getByText(`GitHub API rate limit exceeded — resets at ${formatExpectedResetTime()}`),
      ).toBeTruthy();
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[update-check] manual check failed:', RATE_LIMITED_ERROR);
    expect(screen.getByTestId('update-check-button').props.accessibilityState.disabled).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it('shows the no release message when a manual check returns 404', async () => {
    await expectManualCheckDescription({
      description: 'No GitHub release published yet for this project',
      error: { kind: 'httpError', message: 'No GitHub release published yet for this project', status: 404 },
    });
  });

  it('shows the network message when a manual check fails on the network', async () => {
    await expectManualCheckDescription({
      description: 'Network error — check your connection',
      error: { kind: 'network', message: 'network is down' },
    });
  });

  it('shows the unexpected response message when a manual check cannot parse the payload', async () => {
    await expectManualCheckDescription({
      description: 'GitHub returned an unexpected response',
      error: { kind: 'invalidResponse', message: 'GitHub release payload could not be parsed' },
    });
  });

  it('clears the error when a later manual check succeeds', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const stub = createStubService();
    await renderSection(stub.service);
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });

    stub.fetchLatestRelease.mockResolvedValue(toFetchError({ kind: 'network', message: 'network is down' }));
    await fireEvent.press(screen.getByTestId('update-check-button'));
    await waitFor(() => {
      expect(screen.getByText('Network error — check your connection')).toBeTruthy();
    });

    stub.fetchLatestRelease.mockResolvedValue({ error: null, release: LATEST_RELEASE });
    await fireEvent.press(screen.getByTestId('update-check-button'));
    await waitFor(() => {
      expect(screen.getByText('You are on the latest version')).toBeTruthy();
    });
    expect(screen.queryByText('Network error — check your connection')).toBeNull();
    consoleErrorSpy.mockRestore();
  });

  it('stays silent and warns when the startup check fails', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = createStubService();
    stub.fetchLatestRelease.mockResolvedValue(toFetchError(RATE_LIMITED_ERROR));
    await renderSection(stub.service);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('[update-check] startup check failed:', RATE_LIMITED_ERROR);
    });
    expect(screen.queryByText(/rate limit/i)).toBeNull();
    expect(screen.getByText('Fetches the latest release from GitHub')).toBeTruthy();
    consoleWarnSpy.mockRestore();
  });

  it('stays silent when the service rejects unexpectedly', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = createStubService();
    stub.fetchLatestRelease.mockRejectedValue(new Error('unexpected crash'));
    await renderSection(stub.service);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('[update-check] startup check failed:', {
        kind: 'unknown',
        message: 'unexpected crash',
      });
    });
    expect(screen.getByText('Fetches the latest release from GitHub')).toBeTruthy();
    consoleWarnSpy.mockRestore();
  });
});
