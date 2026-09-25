import { TerminalPreferenceService } from '@/services/terminal/terminal-preference-service';
import type { TerminalPreferenceStorage } from '@/services/terminal/terminal-preference';

const createStorage = (initialValue: string | null = null) => {
  const state = { value: initialValue };
  const writes: string[] = [];
  const storage: TerminalPreferenceStorage & { getWrites(): string[] } = {
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

describe('TerminalPreferenceService', () => {
  const service = new TerminalPreferenceService();

  describe('parsePreference', () => {
    it('parses a persisted preference and drops legacy keys', () => {
      expect(
        service.parsePreference({
          value: '{"fontSize":"l","isSelectionFollowFingerEnabled":true,"isVolumeFontSizeEnabled":false}',
        })
      ).toEqual({
        fontSize: 'l',
        isSelectionFollowFingerEnabled: true,
      });
    });

    it.each([null, '', 'not json', '42', '[]', '"m"'])('falls back to the defaults for %p', (value) => {
      expect(service.parsePreference({ value })).toEqual({
        fontSize: 'm',
        isSelectionFollowFingerEnabled: false,
      });
    });

    it('keeps the relative selection mode when the stored toggle is missing', () => {
      expect(service.parsePreference({ value: '{"fontSize":"s"}' })).toEqual({
        fontSize: 's',
        isSelectionFollowFingerEnabled: false,
      });
    });

    it('falls back to the relative selection mode for a non-boolean toggle', () => {
      expect(service.parsePreference({ value: '{"isSelectionFollowFingerEnabled":"yes"}' })).toEqual({
        fontSize: 'm',
        isSelectionFollowFingerEnabled: false,
      });
    });

    it('falls back to the default font size for an unknown option', () => {
      expect(service.parsePreference({ value: '{"fontSize":"huge"}' })).toEqual({
        fontSize: 'm',
        isSelectionFollowFingerEnabled: false,
      });
    });
  });

  describe('resolveFontSizePx', () => {
    it.each([
      ['xs', 10],
      ['s', 12],
      ['m', 14],
      ['l', 16],
      ['xl', 18],
      ['xxl', 22],
    ] as const)('resolves %s to %dpx', (option, px) => {
      expect(service.resolveFontSizePx({ option })).toBe(px);
    });
  });

  describe('stepFontSize', () => {
    it('steps up one option', () => {
      expect(service.stepFontSize({ direction: 'up', option: 'm' })).toBe('l');
    });

    it('steps down one option', () => {
      expect(service.stepFontSize({ direction: 'down', option: 'm' })).toBe('s');
    });

    it('clamps at xxl when stepping up from the top', () => {
      expect(service.stepFontSize({ direction: 'up', option: 'xxl' })).toBe('xxl');
    });

    it('clamps at xs when stepping down from the bottom', () => {
      expect(service.stepFontSize({ direction: 'down', option: 'xs' })).toBe('xs');
    });
  });

  describe('serializePreference', () => {
    it('serializes the preference as stored json', () => {
      expect(
        service.serializePreference({
          preference: { fontSize: 'xl', isSelectionFollowFingerEnabled: true },
        })
      ).toBe('{"fontSize":"xl","isSelectionFollowFingerEnabled":true}');
    });
  });

  describe('loadPreference', () => {
    it('loads a persisted preference', async () => {
      await expect(
        service.loadPreference({
          storage: createStorage('{"fontSize":"s","isSelectionFollowFingerEnabled":true}'),
        }),
      ).resolves.toEqual({ fontSize: 's', isSelectionFollowFingerEnabled: true });
    });

    it('defaults when nothing is persisted', async () => {
      await expect(service.loadPreference({ storage: createStorage(null) })).resolves.toEqual({
        fontSize: 'm',
        isSelectionFollowFingerEnabled: false,
      });
    });
  });

  describe('savePreference', () => {
    it('writes the serialized preference', async () => {
      const storage = createStorage();

      await service.savePreference({
        preference: { fontSize: 'l', isSelectionFollowFingerEnabled: false },
        storage,
      });

      expect(storage.getWrites()).toEqual([
        '{"fontSize":"l","isSelectionFollowFingerEnabled":false}',
      ]);
    });
  });
});
