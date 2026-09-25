import type {
  FontSizeStepDirection,
  TerminalFontSizeOption,
  TerminalPreference,
  TerminalPreferenceStorage,
} from '@/services/terminal/terminal-preference';
import { DEFAULT_TERMINAL_PREFERENCE } from '@/services/terminal/terminal-preference';

const FONT_SIZE_ORDER: readonly TerminalFontSizeOption[] = ['xs', 's', 'm', 'l', 'xl', 'xxl'];

const FONT_SIZE_PX: Record<TerminalFontSizeOption, number> = {
  l: 16,
  m: 14,
  s: 12,
  xl: 18,
  xs: 10,
  xxl: 22,
};

export class TerminalPreferenceService {
  parsePreference(params: { value: string | null }): TerminalPreference {
    const storedValue = this._parseStoredValue({ value: params.value });
    if (storedValue === null) {
      return DEFAULT_TERMINAL_PREFERENCE;
    }
    return {
      fontSize: this._parseFontSize({ value: storedValue.fontSize }),
      isSelectionFollowFingerEnabled: this._parseIsSelectionFollowFingerEnabled({
        value: storedValue.isSelectionFollowFingerEnabled,
      }),
    };
  }

  resolveFontSizePx(params: { option: TerminalFontSizeOption }): number {
    return FONT_SIZE_PX[params.option];
  }

  serializePreference(params: { preference: TerminalPreference }): string {
    return JSON.stringify(params.preference);
  }

  stepFontSize(params: { direction: FontSizeStepDirection; option: TerminalFontSizeOption }): TerminalFontSizeOption {
    const steppedIndex = this._safeFontSizeIndex({ option: params.option }) + this._stepOffsetFor({
      direction: params.direction,
    });
    const clampedIndex = Math.min(Math.max(steppedIndex, 0), FONT_SIZE_ORDER.length - 1);

    return FONT_SIZE_ORDER[clampedIndex];
  }

  async loadPreference(params: { storage: TerminalPreferenceStorage }): Promise<TerminalPreference> {
    const storedValue = await params.storage.readPreference();

    return this.parsePreference({ value: storedValue });
  }

  async savePreference(params: { preference: TerminalPreference; storage: TerminalPreferenceStorage }): Promise<void> {
    await params.storage.writePreference({ value: this.serializePreference({ preference: params.preference }) });
  }

  protected _parseFontSize(params: { value: unknown }): TerminalFontSizeOption {
    switch (params.value) {
      case 'xs':
        return 'xs';
      case 's':
        return 's';
      case 'm':
        return 'm';
      case 'l':
        return 'l';
      case 'xl':
        return 'xl';
      case 'xxl':
        return 'xxl';
      default:
        return DEFAULT_TERMINAL_PREFERENCE.fontSize;
    }
  }

  protected _parseIsSelectionFollowFingerEnabled(params: { value: unknown }): boolean {
    if (typeof params.value === 'boolean') {
      return params.value;
    }

    return DEFAULT_TERMINAL_PREFERENCE.isSelectionFollowFingerEnabled;
  }

  protected _parseStoredValue(params: { value: string | null }): Partial<TerminalPreference> | null {
    if (params.value === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(params.value);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      return parsed as Partial<TerminalPreference>;
    } catch {
      return null;
    }
  }

  protected _safeFontSizeIndex(params: { option: TerminalFontSizeOption }): number {
    const index = FONT_SIZE_ORDER.indexOf(params.option);
    if (index === -1) {
      return FONT_SIZE_ORDER.indexOf(DEFAULT_TERMINAL_PREFERENCE.fontSize);
    }

    return index;
  }

  protected _stepOffsetFor(params: { direction: FontSizeStepDirection }): number {
    if (params.direction === 'up') {
      return 1;
    }

    return -1;
  }
}
