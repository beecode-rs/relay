export type ThemeSchemePreference = 'dark' | 'light' | 'system';

export type EffectiveThemeScheme = 'light' | 'dark';

export type ThemeSystemScheme = 'dark' | 'light' | 'unspecified' | null;

export type ThemePreference = {
  scheme: ThemeSchemePreference;
};

export type ThemePreferenceStorage = {
  readPreference(): Promise<string | null>;
  writePreference(params: { value: string }): Promise<void>;
};
