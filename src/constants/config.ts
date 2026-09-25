const DEFAULT_SSH_RELAY_URL = 'ws://localhost:4022';

export const config = {
  get isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  },

  get sshRelayUrl(): string {
    return process.env.EXPO_PUBLIC_SSH_RELAY_URL ?? DEFAULT_SSH_RELAY_URL;
  },
} as const;
