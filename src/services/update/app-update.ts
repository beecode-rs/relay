export type UpdatePlatform = 'android' | 'ios' | 'web';

export type AppUpdateStatus = 'idle' | 'checking' | 'upToDate' | 'updateAvailable';

export type AppUpdate = {
  apkDownloadUrl: string | null;
  downloadPageUrl: string;
  tagName: string;
};

export type GithubReleaseAsset = {
  browserDownloadUrl: string;
  name: string;
};

export type GithubRelease = {
  assets: GithubReleaseAsset[];
  downloadPageUrl: string;
  tagName: string;
};

export type AppUpdateError =
  | { kind: 'httpError'; message: string; status: number }
  | { kind: 'invalidResponse'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'rateLimited'; message: string; resetAtEpochSeconds: number | null }
  | { kind: 'unknown'; message: string };

export type AppUpdateFetchResult =
  | { error: AppUpdateError; release: null }
  | { error: null; release: GithubRelease };
