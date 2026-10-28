export type TerminalFontSizeOption = 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';

export type FontSizeStepDirection = 'down' | 'up';

export type TerminalPreference = {
  fontSize: TerminalFontSizeOption;
  isKeyboardCompatibilityEnabled: boolean;
  isSelectionFollowFingerEnabled: boolean;
};

export type TerminalPreferenceStorage = {
  readPreference(): Promise<string | null>;
  writePreference(params: { value: string }): Promise<void>;
};

export const DEFAULT_TERMINAL_PREFERENCE: TerminalPreference = {
  fontSize: 'm',
  isKeyboardCompatibilityEnabled: false,
  isSelectionFollowFingerEnabled: false,
};
