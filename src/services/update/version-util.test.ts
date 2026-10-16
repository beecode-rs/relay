import { versionUtil } from '@/services/update/version-util';

describe('versionUtil.parseVersion', () => {
  it('splits a plain version into numeric parts', () => {
    expect(versionUtil.parseVersion({ version: '0.3.1' })).toEqual([0, 3, 1]);
  });

  it('strips a leading v prefix', () => {
    expect(versionUtil.parseVersion({ version: 'v0.4.0' })).toEqual([0, 4, 0]);
    expect(versionUtil.parseVersion({ version: 'V1.2.3' })).toEqual([1, 2, 3]);
  });

  it('returns undefined for empty and non-numeric input', () => {
    expect(versionUtil.parseVersion({ version: '' })).toBeUndefined();
    expect(versionUtil.parseVersion({ version: 'abc' })).toBeUndefined();
    expect(versionUtil.parseVersion({ version: '1.2.-3' })).toBeUndefined();
  });
});

describe('versionUtil.compare', () => {
  it('compares part by part', () => {
    expect(versionUtil.compare({ base: '0.3.0', candidate: '0.4.0' })).toBeLessThan(0);
    expect(versionUtil.compare({ base: '0.3.1', candidate: '0.3.1' })).toBe(0);
    expect(versionUtil.compare({ base: '1.0.0', candidate: '0.9.9' })).toBeGreaterThan(0);
  });

  it('treats missing parts as zero', () => {
    expect(versionUtil.compare({ base: '1.2', candidate: '1.2.0' })).toBe(0);
    expect(versionUtil.compare({ base: '1.2', candidate: '1.2.1' })).toBeLessThan(0);
  });

  it('compares numerically instead of lexically', () => {
    expect(versionUtil.compare({ base: '0.9.0', candidate: '0.10.0' })).toBeLessThan(0);
  });

  it('returns 0 when either version is unparseable', () => {
    expect(versionUtil.compare({ base: 'abc', candidate: '1.0.0' })).toBe(0);
    expect(versionUtil.compare({ base: '1.0.0', candidate: '' })).toBe(0);
  });
});

describe('versionUtil.isNewerVersion', () => {
  it('is true only for a strictly newer candidate', () => {
    expect(versionUtil.isNewerVersion({ base: '0.3.1', candidate: 'v0.4.0' })).toBe(true);
    expect(versionUtil.isNewerVersion({ base: '0.3.1', candidate: 'v1.0.0' })).toBe(true);
    expect(versionUtil.isNewerVersion({ base: '0.3.1', candidate: 'v0.3.1' })).toBe(false);
    expect(versionUtil.isNewerVersion({ base: '0.10.0', candidate: 'v0.9.0' })).toBe(false);
  });
});
