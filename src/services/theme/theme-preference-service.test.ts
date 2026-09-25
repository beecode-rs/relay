import { ThemePreferenceService } from '@/services/theme/theme-preference-service';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

const createStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const writes: string[] = [];
  const storage: ThemePreferenceStorage & { getWrites(): string[] } = {
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

describe('ThemePreferenceService', () => {
  const service = new ThemePreferenceService();

  describe('parsePreference', () => {
    it.each(['system', 'light', 'dark'] as const)('parses a valid scheme %s', (scheme) => {
      expect(service.parsePreference({ value: scheme })).toEqual({ scheme });
    });

    it.each([null, '', 'blue', 'SYSTEM'])('falls back to system for invalid value %p', (value) => {
      expect(service.parsePreference({ value })).toEqual({ scheme: 'system' });
    });
  });

  describe('resolveScheme', () => {
    it('uses the preference when light or dark is chosen', () => {
      expect(service.resolveScheme({ scheme: 'light', systemScheme: 'dark' })).toBe('light');
      expect(service.resolveScheme({ scheme: 'dark', systemScheme: 'light' })).toBe('dark');
    });

    it('follows the system scheme in auto mode', () => {
      expect(service.resolveScheme({ scheme: 'system', systemScheme: 'dark' })).toBe('dark');
      expect(service.resolveScheme({ scheme: 'system', systemScheme: 'light' })).toBe('light');
    });

    it.each(['light', 'unspecified', null] as const)('treats non-dark system scheme %p as light', (systemScheme) => {
      expect(service.resolveScheme({ scheme: 'system', systemScheme })).toBe('light');
    });
  });

  describe('serializePreference', () => {
    it('serializes the scheme as the stored value', () => {
      expect(service.serializePreference({ preference: { scheme: 'dark' } })).toBe('dark');
    });
  });

  describe('loadPreference', () => {
    it('loads a persisted preference', async () => {
      await expect(service.loadPreference({ storage: createStorage('dark') })).resolves.toEqual({ scheme: 'dark' });
    });

    it('defaults to system when nothing is persisted', async () => {
      await expect(service.loadPreference({ storage: createStorage(null) })).resolves.toEqual({ scheme: 'system' });
    });
  });

  describe('savePreference', () => {
    it('writes the serialized preference', async () => {
      const storage = createStorage();

      await service.savePreference({ preference: { scheme: 'light' }, storage });

      expect(storage.getWrites()).toEqual(['light']);
    });
  });
});
