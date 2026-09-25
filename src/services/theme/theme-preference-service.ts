import type {
  EffectiveThemeScheme,
  ThemePreference,
  ThemePreferenceStorage,
  ThemeSchemePreference,
  ThemeSystemScheme,
} from '@/services/theme/theme-preference';

export class ThemePreferenceService {
  parsePreference(params: { value: string | null }): ThemePreference {
    const { value } = params;

    return { scheme: this._parseScheme({ value: value ?? '' }) };
  }

  resolveScheme(params: { scheme: ThemeSchemePreference; systemScheme: ThemeSystemScheme }): EffectiveThemeScheme {
    const { scheme, systemScheme } = params;
    switch (scheme) {
      case 'dark':
        return 'dark';
      case 'light':
        return 'light';
      case 'system':
        return this._resolveSystemScheme({ systemScheme });
      default:
        return this._resolveSystemScheme({ systemScheme });
    }
  }

  serializePreference(params: { preference: ThemePreference }): string {
    const { preference } = params;

    return preference.scheme;
  }

  async loadPreference(params: { storage: ThemePreferenceStorage }): Promise<ThemePreference> {
    const { storage } = params;
    const storedValue = await storage.readPreference();

    return this.parsePreference({ value: storedValue });
  }

  async savePreference(params: { preference: ThemePreference; storage: ThemePreferenceStorage }): Promise<void> {
    const { preference, storage } = params;
    await storage.writePreference({ value: this.serializePreference({ preference }) });
  }

  protected _parseScheme(params: { value: string }): ThemeSchemePreference {
    const { value } = params;
    switch (value) {
      case 'dark':
        return 'dark';
      case 'light':
        return 'light';
      case 'system':
        return 'system';
      default:
        return 'system';
    }
  }

  protected _resolveSystemScheme(params: { systemScheme: ThemeSystemScheme }): EffectiveThemeScheme {
    const { systemScheme } = params;
    if (systemScheme === 'dark') {
      return 'dark';
    }

    return 'light';
  }
}
