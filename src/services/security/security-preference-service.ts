import type { SecurityPreference, SecurityPreferenceStorage } from '@/services/security/security-preference';
import { DEFAULT_SECURITY_PREFERENCE } from '@/services/security/security-preference';

export class SecurityPreferenceService {
  parsePreference(params: { value: string | null }): SecurityPreference {
    const storedValue = this._parseStoredValue({ value: params.value });
    if (storedValue === null) {
      return DEFAULT_SECURITY_PREFERENCE;
    }

    return {
      isBiometricLockEnabled: this._parseIsBiometricLockEnabled({ value: storedValue.isBiometricLockEnabled }),
    };
  }

  serializePreference(params: { preference: SecurityPreference }): string {
    return JSON.stringify(params.preference);
  }

  async loadPreference(params: { storage: SecurityPreferenceStorage }): Promise<SecurityPreference> {
    const storedValue = await params.storage.readPreference();

    return this.parsePreference({ value: storedValue });
  }

  async savePreference(params: { preference: SecurityPreference; storage: SecurityPreferenceStorage }): Promise<void> {
    await params.storage.writePreference({ value: this.serializePreference({ preference: params.preference }) });
  }

  protected _parseIsBiometricLockEnabled(params: { value: unknown }): boolean {
    if (typeof params.value === 'boolean') {
      return params.value;
    }

    return DEFAULT_SECURITY_PREFERENCE.isBiometricLockEnabled;
  }

  protected _parseStoredValue(params: { value: string | null }): Partial<SecurityPreference> | null {
    if (params.value === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(params.value);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      return parsed as Partial<SecurityPreference>;
    } catch {
      return null;
    }
  }
}
