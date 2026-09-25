import { constant } from '@/constants/constant';

describe('constant.tmux.pathPrelude', () => {
  it('puts user-installed tmux directories ahead of the system PATH', () => {
    expect(constant.tmux.pathPrelude.startsWith('PATH=/home/linuxbrew/.linuxbrew/bin:/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:${PATH:-/usr/bin:/bin};')).toBe(true);
  });

  it('prefers the directory of the running tmux server binary', () => {
    expect(constant.tmux.pathPrelude).toContain('pgrep -u "$(id -u)" -x "tmux: server"');
    expect(constant.tmux.pathPrelude).toContain('PATH=$(dirname "$relay_tmux_exe"):$PATH;');
  });

  it('stays embeddable inside a single-quoted sh -c body', () => {
    expect(constant.tmux.pathPrelude).not.toContain("'");
    expect(constant.tmux.pathPrelude.endsWith('export PATH;')).toBe(true);
  });
});
