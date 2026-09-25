import { sshTerminalPort } from '@/services/terminal/ssh-terminal-port';

describe('sshTerminalPort', () => {
  it('exposes the ssh2 shell client surface', () => {
    expect(typeof sshTerminalPort.connect).toBe('function');
    expect(typeof sshTerminalPort.exec).toBe('function');
    expect(typeof sshTerminalPort.runInLoginShell).toBe('function');
    expect(typeof sshTerminalPort.write).toBe('function');
    expect(typeof sshTerminalPort.resize).toBe('function');
    expect(typeof sshTerminalPort.disconnect).toBe('function');
    expect(typeof sshTerminalPort.addListener).toBe('function');
    expect(typeof sshTerminalPort.removeListeners).toBe('function');
  });

  it('is supported on every platform', () => {
    expect(sshTerminalPort.isSupported).toBe(true);
  });
});
