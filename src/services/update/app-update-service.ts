import { constant } from '@/constants/constant';
import type {
  AppUpdate,
  AppUpdateError,
  AppUpdateFetchResult,
  GithubRelease,
  GithubReleaseAsset,
  UpdatePlatform,
} from '@/services/update/app-update';
import { versionUtil } from '@/services/update/version-util';

type GithubApiResponse = {
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

type GithubApiFetcher = (params: { url: string }) => Promise<GithubApiResponse>;

const defaultGithubApiFetcher: GithubApiFetcher = async (params: { url: string }) => {
  return fetch(params.url, {
    headers: { Accept: 'application/vnd.github+json' },
  });
};

export class AppUpdateService {
  protected readonly fetchResponse: GithubApiFetcher;

  constructor(params: { fetchResponse?: GithubApiFetcher } = {}) {
    this.fetchResponse = params.fetchResponse ?? defaultGithubApiFetcher;
  }

  async fetchLatestRelease(): Promise<AppUpdateFetchResult> {
    try {
      const response = await this.fetchResponse({ url: constant.update.github.latestReleaseApiUrl });
      const error = this.toResponseError({ response });
      if (error !== null) {
        return { error, release: null };
      }

      return this.toReleaseResult({ payload: await response.json() });
    } catch (cause) {
      return { error: this.toNetworkError({ cause }), release: null };
    }
  }

  resolveDownloadUrl(params: { platform: UpdatePlatform; update: AppUpdate }): string {
    const { platform, update } = params;
    if (platform === 'android' && update.apkDownloadUrl !== null) {
      return update.apkDownloadUrl;
    }

    return update.downloadPageUrl;
  }

  resolveUpdate(params: { currentVersion: string | undefined; release: GithubRelease }): AppUpdate | undefined {
    const { currentVersion, release } = params;
    if (currentVersion === undefined) {
      return undefined;
    }
    if (!versionUtil.isNewerVersion({ base: currentVersion, candidate: release.tagName })) {
      return undefined;
    }

    return {
      apkDownloadUrl: this.findApkAsset({ release })?.browserDownloadUrl ?? null,
      downloadPageUrl: release.downloadPageUrl,
      tagName: release.tagName,
    };
  }

  protected findApkAsset(params: { release: GithubRelease }): GithubReleaseAsset | undefined {
    return params.release.assets.find((asset) => {
      return asset.name.toLowerCase().endsWith(constant.update.apkAssetNameSuffix);
    });
  }

  protected parseAsset(params: { asset: unknown }): GithubReleaseAsset | undefined {
    const record = params.asset;
    if (typeof record !== 'object' || record === null) {
      return undefined;
    }
    const asset = record as Record<string, unknown>;
    const browserDownloadUrl = asset.browser_download_url;
    const name = asset.name;
    if (typeof browserDownloadUrl !== 'string' || typeof name !== 'string') {
      return undefined;
    }

    return { browserDownloadUrl, name };
  }

  protected parseAssets(params: { assets: unknown }): GithubReleaseAsset[] {
    if (!Array.isArray(params.assets)) {
      return [];
    }

    return params.assets.reduce<GithubReleaseAsset[]>((collected, asset) => {
      const parsedAsset = this.parseAsset({ asset });
      if (parsedAsset === undefined) {
        return collected;
      }

      return [...collected, parsedAsset];
    }, []);
  }

  protected parseRelease(params: { payload: unknown }): GithubRelease | undefined {
    const payload = params.payload;
    if (typeof payload !== 'object' || payload === null) {
      return undefined;
    }
    const release = payload as Record<string, unknown>;
    const downloadPageUrl = release.html_url;
    const tagName = release.tag_name;
    if (typeof downloadPageUrl !== 'string' || typeof tagName !== 'string') {
      return undefined;
    }

    return {
      assets: this.parseAssets({ assets: release.assets }),
      downloadPageUrl,
      tagName,
    };
  }

  protected toNetworkError(params: { cause: unknown }): AppUpdateError {
    const { cause } = params;
    if (cause instanceof Error) {
      return { kind: 'network', message: cause.message };
    }

    return { kind: 'network', message: String(cause) };
  }

  protected toReleaseResult(params: { payload: unknown }): AppUpdateFetchResult {
    const release = this.parseRelease({ payload: params.payload });
    if (release === undefined) {
      return {
        error: { kind: 'invalidResponse', message: 'GitHub release payload could not be parsed' },
        release: null,
      };
    }

    return { error: null, release };
  }

  protected toResetEpochSeconds(params: { value: string | null }): number | null {
    const { value } = params;
    if (value === null) {
      return null;
    }
    const epochSeconds = Number.parseInt(value, 10);
    if (Number.isNaN(epochSeconds)) {
      return null;
    }

    return epochSeconds;
  }

  protected toResponseError(params: { response: GithubApiResponse }): AppUpdateError | null {
    const { response } = params;
    if (response.ok) {
      return null;
    }
    if (response.status === 403 && response.headers.get(constant.update.github.rateLimitRemainingHeader) === '0') {
      return {
        kind: 'rateLimited',
        message: 'GitHub API rate limit exceeded',
        resetAtEpochSeconds: this.toResetEpochSeconds({
          value: response.headers.get(constant.update.github.rateLimitResetHeader),
        }),
      };
    }
    if (response.status === 404) {
      return { kind: 'httpError', message: 'No GitHub release published yet for this project', status: 404 };
    }

    return {
      kind: 'httpError',
      message: `GitHub release request failed with status ${String(response.status)}`,
      status: response.status,
    };
  }
}

export const appUpdateService = new AppUpdateService();
