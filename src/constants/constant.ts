export const constant = {
  app: {
    beecodeWebsiteUrl: 'https://beecode.rs',
  },
  deviceKey: {
    accessGroup: 'com.beecode.devicekeys',
    itemKey: 'beecode-device-key',
    keychainService: 'com.beecode.devicekey',
  },
  font: {
    monoBoldFamily: 'jetBrainsMonoBold',
    monoRegularFamily: 'jetBrainsMonoRegular',
  },
  keyboard: {
    sentinel: '\u200b',
  },
  server: {
    defaultPort: 22,
  },
  terminal: {
    bg: '#000000',
    columns: {
      max: 500,
      min: 10,
    },
    fg: '#eeeeee',
    gridProbe: {
      charCount: 20,
      text: 'MMMMMMMMMMMMMMMMMMMM',
    },
    gesture: {
      autoScrollIntervalMs: 50,
      doubleTapMs: 300,
      doubleTapSlopPx: 10,
      longPressMs: 450,
      longPressSlopPx: 10,
      pinch: {
        stepInRatio: 1.2,
        stepOutRatio: 0.8,
      },
    },
    initialSize: {
      cols: 80,
      rows: 24,
    },
    rows: {
      max: 200,
      min: 4,
    },
    selection: {
      bg: '#2b4a6f',
      fromActiveBg: '#57d95c',
      fromBg: '#2e6b32',
      toActiveBg: '#d98a57',
      toBg: '#7a4a2e',
    },
  },
  tmux: {
    // Exec channels run a non-interactive shell whose PATH often lacks user-installed
    // tmux (Linuxbrew, Homebrew), so a bare `tmux` resolves to an older system build
    // that cannot talk to the running server ("server exited unexpectedly"). Login
    // shells have the opposite problem: their PATH resolves a user-installed tmux
    // newer than the running server, and a version-skewed client fails the terminal
    // handshake ("open terminal failed: not a terminal"). Every tmux invocation -
    // exec, login shell, or interactive - must prefer the running server's own
    // binary, then common package-manager dirs, then the system PATH. Must stay free
    // of single quotes - it is embedded in `sh -c '...'`.
    pathPrelude:
      'PATH=/home/linuxbrew/.linuxbrew/bin:/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:${PATH:-/usr/bin:/bin}; ' +
      'relay_tmux_exe=$(readlink "/proc/$(pgrep -u "$(id -u)" -x "tmux: server" 2>/dev/null | head -n 1)/exe" 2>/dev/null); ' +
      'if [ -x "$relay_tmux_exe" ]; then PATH=$(dirname "$relay_tmux_exe"):$PATH; fi; export PATH;',
  },
} as const;
