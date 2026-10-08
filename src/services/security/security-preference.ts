export type SecurityPreference = {
  isBiometricLockEnabled: boolean;
};

export type SecurityPreferenceStorage = {
  readPreference(): Promise<string | null>;
  writePreference(params: { value: string }): Promise<void>;
};

export const DEFAULT_SECURITY_PREFERENCE: SecurityPreference = {
  isBiometricLockEnabled: false,
};
