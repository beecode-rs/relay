import type { AppUpdate, GithubRelease } from '@/services/update/app-update';
import { AppUpdateService } from '@/services/update/app-update-service';

const APK_DOWNLOAD_URL = 'https://github.com/beecode-rs/relay/releases/download/v0.4.0/Relay-v0.4.0-android.apk';
const IPA_DOWNLOAD_URL = 'https://github.com/beecode-rs/relay/releases/download/v0.4.0/Relay-v0.4.0-ios-unsigned.ipa';
const RELEASE_PAGE_URL = 'https://github.com/beecode-rs/relay/releases/tag/v0.4.0';
const RATE_LIMIT_RESET_EPOCH_SECONDS = 1799999520;

const releasePayload = {
  assets: [
    { name: 'Relay-v0.4.0-ios-unsigned.ipa', browser_download_url: IPA_DOWNLOAD_URL },
    { name: 'Relay-v0.4.0-android.apk', browser_download_url: APK_DOWNLOAD_URL },
  ],
  html_url: RELEASE_PAGE_URL,
  tag_name: 'v0.4.0',
};

type ResponseStubParams = {
  headers?: Record<string, string>;
  ok: boolean;
  payload: unknown;
  status: number;
};

const createResponseStub = (params: ResponseStubParams) => {
  return {
    headers: {
      get: (name: string) => {
        return params.headers?.[name] ?? null;
      },
    },
    json: () => {
      return Promise.resolve(params.payload);
    },
    ok: params.ok,
    status: params.status,
  };
};

const createServiceWithResponse = (params: ResponseStubParams): AppUpdateService => {
  return new AppUpdateService({
    fetchResponse: () => {
      return Promise.resolve(createResponseStub(params));
    },
  });
};

describe('AppUpdateService.fetchLatestRelease', () => {
  it('parses the latest release payload', async () => {
    const service = createServiceWithResponse({ ok: true, payload: releasePayload, status: 200 });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: null,
      release: {
        assets: [
          { name: 'Relay-v0.4.0-ios-unsigned.ipa', browserDownloadUrl: IPA_DOWNLOAD_URL },
          { name: 'Relay-v0.4.0-android.apk', browserDownloadUrl: APK_DOWNLOAD_URL },
        ],
        downloadPageUrl: RELEASE_PAGE_URL,
        tagName: 'v0.4.0',
      },
    });
  });

  it('resolves an invalid response error for a malformed payload', async () => {
    const service = createServiceWithResponse({ ok: true, payload: { unexpected: true }, status: 200 });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: { kind: 'invalidResponse', message: 'GitHub release payload could not be parsed' },
      release: null,
    });
  });

  it('resolves a network error when the request fails', async () => {
    const service = new AppUpdateService({
      fetchResponse: () => {
        return Promise.reject(new Error('network is down'));
      },
    });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: { kind: 'network', message: 'network is down' },
      release: null,
    });
  });

  it('classifies a rate limited response and carries the reset epoch', async () => {
    const service = createServiceWithResponse({
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(RATE_LIMIT_RESET_EPOCH_SECONDS),
      },
      ok: false,
      payload: { message: 'API rate limit exceeded' },
      status: 403,
    });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: {
        kind: 'rateLimited',
        message: 'GitHub API rate limit exceeded',
        resetAtEpochSeconds: RATE_LIMIT_RESET_EPOCH_SECONDS,
      },
      release: null,
    });
  });

  it('keeps a null reset epoch when the rate limit reset header is missing', async () => {
    const service = createServiceWithResponse({
      headers: { 'x-ratelimit-remaining': '0' },
      ok: false,
      payload: { message: 'API rate limit exceeded' },
      status: 403,
    });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: { kind: 'rateLimited', message: 'GitHub API rate limit exceeded', resetAtEpochSeconds: null },
      release: null,
    });
  });

  it('resolves the no release message for a 404 response', async () => {
    const service = createServiceWithResponse({ ok: false, payload: { message: 'Not Found' }, status: 404 });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: { kind: 'httpError', message: 'No GitHub release published yet for this project', status: 404 },
      release: null,
    });
  });

  it('treats a 403 with remaining quota as a plain http error', async () => {
    const service = createServiceWithResponse({
      headers: { 'x-ratelimit-remaining': '12' },
      ok: false,
      payload: {},
      status: 403,
    });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: { kind: 'httpError', message: 'GitHub release request failed with status 403', status: 403 },
      release: null,
    });
  });

  it('resolves a plain http error for other non-200 responses', async () => {
    const service = createServiceWithResponse({ ok: false, payload: {}, status: 500 });

    await expect(service.fetchLatestRelease()).resolves.toEqual({
      error: { kind: 'httpError', message: 'GitHub release request failed with status 500', status: 500 },
      release: null,
    });
  });
});

describe('AppUpdateService.resolveUpdate', () => {
  const release: GithubRelease = {
    assets: [{ name: 'Relay-v0.4.0-android.apk', browserDownloadUrl: APK_DOWNLOAD_URL }],
    downloadPageUrl: RELEASE_PAGE_URL,
    tagName: 'v0.4.0',
  };

  it('resolves an update when the release tag is newer than the current version', () => {
    const service = new AppUpdateService();

    expect(service.resolveUpdate({ currentVersion: '0.3.1', release })).toEqual({
      apkDownloadUrl: APK_DOWNLOAD_URL,
      downloadPageUrl: RELEASE_PAGE_URL,
      tagName: 'v0.4.0',
    });
  });

  it('resolves without an apk url when the release has no apk asset', () => {
    const service = new AppUpdateService();
    const ipaOnlyRelease: GithubRelease = {
      assets: [{ name: 'Relay-v0.4.0-ios-unsigned.ipa', browserDownloadUrl: IPA_DOWNLOAD_URL }],
      downloadPageUrl: RELEASE_PAGE_URL,
      tagName: 'v0.4.0',
    };

    expect(service.resolveUpdate({ currentVersion: '0.3.1', release: ipaOnlyRelease })).toEqual({
      apkDownloadUrl: null,
      downloadPageUrl: RELEASE_PAGE_URL,
      tagName: 'v0.4.0',
    });
  });

  it('returns undefined when the release is not newer than the current version', () => {
    const service = new AppUpdateService();

    expect(service.resolveUpdate({ currentVersion: '0.4.0', release })).toBeUndefined();
    expect(service.resolveUpdate({ currentVersion: '0.5.0', release })).toBeUndefined();
  });

  it('returns undefined when the current version is missing', () => {
    const service = new AppUpdateService();

    expect(service.resolveUpdate({ currentVersion: undefined, release })).toBeUndefined();
  });
});

describe('AppUpdateService.resolveDownloadUrl', () => {
  const updateWithApk: AppUpdate = {
    apkDownloadUrl: APK_DOWNLOAD_URL,
    downloadPageUrl: RELEASE_PAGE_URL,
    tagName: 'v0.4.0',
  };
  const updateWithoutApk: AppUpdate = {
    apkDownloadUrl: null,
    downloadPageUrl: RELEASE_PAGE_URL,
    tagName: 'v0.4.0',
  };

  it('returns the apk download url on android when one exists', () => {
    const service = new AppUpdateService();

    expect(service.resolveDownloadUrl({ platform: 'android', update: updateWithApk })).toBe(APK_DOWNLOAD_URL);
  });

  it('returns the release page on android when no apk asset exists', () => {
    const service = new AppUpdateService();

    expect(service.resolveDownloadUrl({ platform: 'android', update: updateWithoutApk })).toBe(RELEASE_PAGE_URL);
  });

  it('returns the release page on ios and web', () => {
    const service = new AppUpdateService();

    expect(service.resolveDownloadUrl({ platform: 'ios', update: updateWithApk })).toBe(RELEASE_PAGE_URL);
    expect(service.resolveDownloadUrl({ platform: 'web', update: updateWithApk })).toBe(RELEASE_PAGE_URL);
  });
});
