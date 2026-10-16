import Constants from 'expo-constants';
import { type JSX, type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';

import type {
  AppUpdate,
  AppUpdateError,
  AppUpdateFetchResult,
  AppUpdateStatus,
  GithubRelease,
  UpdatePlatform,
} from '@/services/update/app-update';
import { AppUpdateService, appUpdateService } from '@/services/update/app-update-service';

interface UpdateCheckContextValue {
  checkForUpdate: () => Promise<void>;
  error: AppUpdateError | null;
  openUpdate: () => Promise<void>;
  status: AppUpdateStatus;
  update: AppUpdate | null;
}

const UpdateCheckContext = createContext<UpdateCheckContextValue | undefined>(undefined);

type UpdateCheckProviderProps = {
  children: ReactNode;
  service?: AppUpdateService;
};

const toUpdatePlatform = (os: string): UpdatePlatform => {
  switch (os) {
    case 'android':
      return 'android';
    case 'ios':
      return 'ios';
    default:
      return 'web';
  }
};

const toUnknownFetchResult = (cause: unknown): AppUpdateFetchResult => {
  if (cause instanceof Error) {
    return { error: { kind: 'unknown', message: cause.message }, release: null };
  }

  return { error: { kind: 'unknown', message: String(cause) }, release: null };
};

export const UpdateCheckProvider = ({
  children,
  service = appUpdateService,
}: UpdateCheckProviderProps): JSX.Element => {
  const [error, setError] = useState<AppUpdateError | null>(null);
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const [update, setUpdate] = useState<AppUpdate | null>(null);

  const applyRelease = useCallback(
    (release: GithubRelease): void => {
      const resolvedUpdate = service.resolveUpdate({
        currentVersion: Constants.expoConfig?.version,
        release,
      });
      if (resolvedUpdate === undefined) {
        setError(null);
        setUpdate(null);
        setStatus('upToDate');

        return;
      }
      setError(null);
      setUpdate(resolvedUpdate);
      setStatus('updateAvailable');
    },
    [service],
  );

  const fetchLatestReleaseSafe = useCallback((): Promise<AppUpdateFetchResult> => {
    return service.fetchLatestRelease().catch(toUnknownFetchResult);
  }, [service]);

  const checkForUpdate = useCallback(async (): Promise<void> => {
    setError(null);
    setStatus('checking');
    const result = await fetchLatestReleaseSafe();
    if (result.error !== null) {
      console.error('[update-check] manual check failed:', result.error);
      setError(result.error);
      setStatus('idle');

      return;
    }
    applyRelease(result.release);
  }, [applyRelease, fetchLatestReleaseSafe]);

  const openUpdate = useCallback(async (): Promise<void> => {
    if (update === null) {
      return;
    }
    const url = service.resolveDownloadUrl({ platform: toUpdatePlatform(Platform.OS), update });
    try {
      await Linking.openURL(url);
    } catch {
      return;
    }
  }, [service, update]);

  useEffect(() => {
    let isCancelled = false;
    void fetchLatestReleaseSafe().then((result) => {
      if (isCancelled) {
        return;
      }
      if (result.error !== null) {
        console.warn('[update-check] startup check failed:', result.error);
        setStatus('idle');

        return;
      }
      applyRelease(result.release);
    });

    return () => {
      isCancelled = true;
    };
  }, [applyRelease, fetchLatestReleaseSafe]);

  const contextValue = useMemo(() => {
    return { checkForUpdate, error, openUpdate, status, update };
  }, [checkForUpdate, error, openUpdate, status, update]);

  return <UpdateCheckContext.Provider value={contextValue}>{children}</UpdateCheckContext.Provider>;
};

export const useOptionalUpdateCheck = (): UpdateCheckContextValue | undefined => {
  return useContext(UpdateCheckContext);
};

export const useUpdateCheck = (): UpdateCheckContextValue => {
  const contextValue = useContext(UpdateCheckContext);

  if (!contextValue) {
    throw new Error('useUpdateCheck requires UpdateCheckProvider');
  }

  return contextValue;
};
