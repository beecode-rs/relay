import { remotePathUtil } from '@/services/terminal/remote-path-util';

describe('remotePathUtil.normalizeRootPath', () => {
  it('collapses empty and blank input to the root', () => {
    expect(remotePathUtil.normalizeRootPath({ path: '' })).toBe('/');
    expect(remotePathUtil.normalizeRootPath({ path: '   ' })).toBe('/');
  });

  it('keeps the root path as-is', () => {
    expect(remotePathUtil.normalizeRootPath({ path: '/' })).toBe('/');
  });

  it('forces a leading slash onto relative input', () => {
    expect(remotePathUtil.normalizeRootPath({ path: 'home/user' })).toBe('/home/user');
  });

  it('trims surrounding whitespace and trailing slashes', () => {
    expect(remotePathUtil.normalizeRootPath({ path: '  /home/user/  ' })).toBe('/home/user');
  });

  it('collapses repeated leading slashes', () => {
    expect(remotePathUtil.normalizeRootPath({ path: '//home//user' })).toBe('/home//user');
  });
});

describe('remotePathUtil.join', () => {
  it('joins a directory and name with a slash', () => {
    expect(remotePathUtil.join({ dir: '/home', name: 'user' })).toBe('/home/user');
  });

  it('does not double the slash when the directory already ends with one', () => {
    expect(remotePathUtil.join({ dir: '/', name: 'home' })).toBe('/home');
  });
});

describe('remotePathUtil.toParentDir', () => {
  it('removes the last segment', () => {
    expect(remotePathUtil.toParentDir({ path: '/home/user/projects' })).toBe('/home/user');
  });

  it('stops at the root', () => {
    expect(remotePathUtil.toParentDir({ path: '/home' })).toBe('/');
    expect(remotePathUtil.toParentDir({ path: '/' })).toBe('/');
  });
});

describe('remotePathUtil.toParts', () => {
  it('splits into non-empty segments', () => {
    expect(remotePathUtil.toParts({ path: '/home/user//' })).toEqual(['home', 'user']);
  });
});
