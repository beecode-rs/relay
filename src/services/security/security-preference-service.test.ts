import type { SecurityPreferenceStorage } from '@/services/security/security-preference';
import { SecurityPreferenceService } from '@/services/security/security-preference-service';

const createStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const writes: string[] = [];
  const storage: SecurityPreferenceStorage & { getWrites(): string[] } = {
    async readPreference() {
      return state.value;
    },
    async writePreference(params) {
      state.value = params.value;
      writes.push(params.value);
    },
    getWrites() {
      return writes;
    },
  };

  return storage;
};

describe('SecurityPreferenceService', () => {
  const service = new SecurityPreferenceService();

  describe('parsePreference', () => {
    it('parses a persisted preference', () => {
      expect(service.parsePreference({ value: '{"isBiometricLockEnabled":true}' })).toEqual({
        isBiometricLockEnabled: true,
      });
    });

    it.each([null, '', 'not json', '42', '[]', '"lock"'])('falls back to the defaults for %p', (value) => {
      expect(service.parsePreference({ value })).toEqual({
        isBiometricLockEnabled: false,
      });
    });

    it('falls back to a disabled lock for a non-boolean toggle', () => {
      expect(service.parsePreference({ value: '{"isBiometricLockEnabled":"yes"}' })).toEqual({
        isBiometricLockEnabled: false,
      });
    });

    it('drops unknown keys', () => {
      expect(service.parsePreference({ value: '{"isBiometricLockEnabled":true,"isPinLockEnabled":true}' })).toEqual({
        isBiometricLockEnabled: true,
      });
    });
  });

  describe('serializePreference', () => {
    it('serializes the preference as stored json', () => {
      expect(service.serializePreference({ preference: { isBiometricLockEnabled: true } })).toBe(
        '{"isBiometricLockEnabled":true}',
      );
    });
  });

  describe('loadPreference', () => {
    it('loads a persisted preference', async () => {
      await expect(
        service.loadPreference({ storage: createStorage('{"isBiometricLockEnabled":true}') }),
      ).resolves.toEqual({ isBiometricLockEnabled: true });
    });

    it('defaults when nothing is persisted', async () => {
      await expect(service.loadPreference({ storage: createStorage(null) })).resolves.toEqual({
        isBiometricLockEnabled: false,
      });
    });
  });

  describe('savePreference', () => {
    it('writes the serialized preference', async () => {
      const storage = createStorage();

      await service.savePreference({ preference: { isBiometricLockEnabled: true }, storage });

      expect(storage.getWrites()).toEqual(['{"isBiometricLockEnabled":true}']);
    });
  });
});
