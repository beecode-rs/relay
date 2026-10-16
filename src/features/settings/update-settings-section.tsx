import { type JSX } from 'react';
import { Button } from 'react-native-paper';

import { useUpdateCheck } from '@/components/update-check-context';
import type { AppUpdate, AppUpdateError, AppUpdateStatus } from '@/services/update/app-update';
import { SettingsRow } from '@/features/settings/settings-row';
import { SettingsSection } from '@/features/settings/settings-section';

const formatResetTime = (params: { epochSeconds: number }): string => {
  const { epochSeconds } = params;

  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', hour12: false, minute: '2-digit' }).format(
    new Date(epochSeconds * 1000),
  );
};

const resolveRateLimitedDescription = (params: { resetAtEpochSeconds: number | null }): string => {
  const { resetAtEpochSeconds } = params;
  if (resetAtEpochSeconds === null) {
    return 'GitHub API rate limit exceeded';
  }

  return `GitHub API rate limit exceeded — resets at ${formatResetTime({ epochSeconds: resetAtEpochSeconds })}`;
};

const resolveErrorDescription = (params: { error: AppUpdateError }): string => {
  const { error } = params;
  if (error.kind === 'httpError' && error.status === 404) {
    return 'No GitHub release published yet for this project';
  }
  switch (error.kind) {
    case 'httpError':
      return `GitHub request failed with status ${String(error.status)}`;
    case 'invalidResponse':
      return 'GitHub returned an unexpected response';
    case 'network':
      return 'Network error — check your connection';
    case 'rateLimited':
      return resolveRateLimitedDescription({ resetAtEpochSeconds: error.resetAtEpochSeconds });
    default:
      return 'Update check failed';
  }
};

const resolveButtonLabel = (params: { status: AppUpdateStatus; update: AppUpdate | null }): string => {
  const { status } = params;
  switch (status) {
    case 'checking':
      return 'Checking…';
    case 'updateAvailable':
      return 'Download update';
    case 'upToDate':
      return 'Check again';
    default:
      return 'Check for updates';
  }
};

const resolveStatusDescription = (params: {
  error: AppUpdateError | null;
  status: AppUpdateStatus;
  update: AppUpdate | null;
}): string => {
  const { error, status, update } = params;
  if (error !== null) {
    return resolveErrorDescription({ error });
  }
  switch (status) {
    case 'checking':
      return 'Contacting GitHub releases';
    case 'updateAvailable':
      return `Version ${update?.tagName} is available`;
    case 'upToDate':
      return 'You are on the latest version';
    default:
      return 'Fetches the latest release from GitHub';
  }
};

export const UpdateSettingsSection = (): JSX.Element => {
  const { checkForUpdate, error, openUpdate, status, update } = useUpdateCheck();

  const handlePress = (): void => {
    if (status === 'updateAvailable') {
      void openUpdate();

      return;
    }
    void checkForUpdate();
  };

  return (
    <SettingsSection title="Updates">
      <SettingsRow
        control={
          <Button
            disabled={status === 'checking'}
            mode={status === 'updateAvailable' ? 'contained' : 'outlined'}
            onPress={handlePress}
            testID="update-check-button"
          >
            {resolveButtonLabel({ status, update })}
          </Button>
        }
        description={resolveStatusDescription({ error, status, update })}
        label="Check for updates"
      />
    </SettingsSection>
  );
};
