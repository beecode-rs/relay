import Constants from 'expo-constants';

export const appInfo = {
  get name(): string {
    return Constants.expoConfig?.name ?? 'Relay';
  },
} as const;
