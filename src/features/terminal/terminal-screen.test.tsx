import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Alert, Dimensions, Keyboard, Platform, StyleSheet } from 'react-native';
import type { EmitterSubscription, KeyboardEvent } from 'react-native';

import { constant } from '@/constants/constant';
import { TerminalPreferenceProvider } from '@/components/terminal-preference-context';
import { TerminalScreen, screenBottomInsetOf } from '@/features/terminal/terminal-screen';
import type { TerminalScreenSession } from '@/features/terminal/terminal-screen';

import type { TerminalPreferenceStorage } from '@/services/terminal/terminal-preference';
import { serverConnectOptions } from '@/services/connection/connect-options';
import type { ServerLastSessionStore } from '@/services/connection/server-last-session-store';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import type { TerminalSessionState } from '@/services/terminal/terminal-session';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

jest.mock('expo-clipboard', () => {
  return { setStringAsync: jest.fn(async () => { return true; }) };
});

jest.mock('expo-router', () => {
  return { router: { dismissTo: jest.fn(), navigate: jest.fn(), replace: jest.fn() } };
});

jest.mock('@/services/connection/connect-options', () => {
  return { serverConnectOptions: { build: jest.fn() } };
});

const mockSafeArea = { bottom: 0 };

jest.mock('react-native-safe-area-context', () => {
  return {
    useSafeAreaInsets: () => {
      return { bottom: mockSafeArea.bottom, left: 0, right: 0, top: 0 };
    },
  };
});

jest.mock('@expo-google-fonts/jetbrains-mono', () => {
  return {
    JetBrainsMono_400Regular: 0,
    JetBrainsMono_700Bold: 0,
    useFonts: () => {
      return [true];
    },
  };
});

const SNAPSHOT: TerminalSnapshot = {
  rows: [
    {
      segments: [
        { bold: false, inverse: false, text: 'hello ', underline: false },
        { bold: false, fgColor: 1, inverse: false, text: 'red', underline: false },
      ],
    },
  ],
  cursor: { x: 0, y: 0 },
  firstLine: 0,
  isAlternateBuffer: false,
  viewportRowCount: 1,
};

const PROFILE_ID = 'profile-1';

const CONNECT_OPTIONS: SshConnectOptions = {
  acceptedHostKeys: ['example.com ssh-ed25519 KEY'],
  auth: { kind: 'password', password: 'secret' },
  cols: 80,
  host: 'example.com',
  port: 22,
  rows: 24,
  username: 'user',
};

type FakeSession = TerminalScreenSession & {
  acceptedHostKeyCount: number;
  createdTmuxSessions: { sessionName: string; startPath?: string }[];
  detachedTmuxCount: number;
  dismissedTmuxPromptCount: number;
  emitState(state: TerminalSessionState): void;
  endedCount: number;
  focusedTmuxSessions: string[];
  killedTmuxSessions: string[];
  listRemoteDirectoriesCalls: { path: string }[];
  listTmuxSessionsCalls: number;
  rejectedHostKeyCount: number;
  remoteDirectories: string[];
  renamedTmuxSessions: { nextSessionName: string; sessionName: string }[];
  resized: { cols: number; rows: number }[];
  scrolledRows: number[];
  started: SshConnectOptions[];
  tmuxCurrentSessionName: string | null;
  tmuxListError: string | null;
  tmuxSessions: string[];
  writes: string[];
};

const isActiveStatus = (status: TerminalSessionState['status']): boolean => {
  return ['connecting', 'connected', 'host-key-unknown', 'host-key-changed'].includes(status);
};

const sameIdentity = (a: SshConnectOptions, b: SshConnectOptions): boolean => {
  return a.host === b.host && a.port === b.port && a.username === b.username;
};

const createFakeSession = (
  initialStatus?: TerminalSessionState['status'],
  liveProfile?: SshConnectOptions,
  isRemoteScrollEnabled = false,
): FakeSession => {
  const listeners = new Set<(state: TerminalSessionState) => void>();
  const tracked = { live: liveProfile ?? null, state: { status: initialStatus ?? 'idle' } as TerminalSessionState };
  return {
    acceptHostKey() {
      this.acceptedHostKeyCount += 1;
    },
    acceptedHostKeyCount: 0,
    drainPendingOutput: () => {
      return null;
    },
    emitState(state) {
      tracked.state = state;
      listeners.forEach((listener) => {
        listener(state);
      });
    },
    endedCount: 0,
    end() {
      this.endedCount += 1;
    },
    get currentState() {
      return tracked.state;
    },
    detachedTmuxCount: 0,
    async detachTmuxSession() {
      this.detachedTmuxCount += 1;

      return true;
    },
    dismissTmuxPrompt() {
      this.dismissedTmuxPromptCount += 1;
    },
    dismissedTmuxPromptCount: 0,
    isApplicationCursorKeys: false,
    isRemoteScrollEnabled,
    isActiveFor: (options) => {
      return tracked.live !== null && isActiveStatus(tracked.state.status) && sameIdentity(tracked.live, options);
    },
    createdTmuxSessions: [],
    async createTmuxSession(params: { sessionName: string; startPath?: string }) {
      this.createdTmuxSessions.push(params);

      return true;
    },
    focusedTmuxSessions: [],
    async focusTmuxSession(params: { sessionName: string }) {
      this.focusedTmuxSessions.push(params.sessionName);

      return true;
    },
    killedTmuxSessions: [],
    async killTmuxSession(params: { sessionName: string }) {
      this.killedTmuxSessions.push(params.sessionName);
      this.tmuxSessions = this.tmuxSessions.filter((sessionName) => {
        return sessionName !== params.sessionName;
      });

      return true;
    },
    async renameTmuxSession(params: { nextSessionName: string; sessionName: string }) {
      this.renamedTmuxSessions.push(params);
      this.tmuxSessions = this.tmuxSessions.map((sessionName) => {
        if (sessionName !== params.sessionName) {
          return sessionName;
        }

        return params.nextSessionName;
      });

      return true;
    },
    listRemoteDirectoriesCalls: [],
    remoteDirectories: [],
    renamedTmuxSessions: [],
    async listRemoteDirectories(params: { path: string }) {
      this.listRemoteDirectoriesCalls.push({ path: params.path });

      return this.remoteDirectories;
    },
    listTmuxSessionsCalls: 0,
    tmuxCurrentSessionName: null as string | null,
    tmuxListError: null as string | null,
    tmuxSessions: [],
    async listTmuxSessions() {
      this.listTmuxSessionsCalls += 1;
      if (this.tmuxListError !== null) {
        return { kind: 'error' as const, message: this.tmuxListError };
      }

      return {
        kind: 'sessions' as const,
        currentSessionName: this.tmuxCurrentSessionName,
        sessionNames: this.tmuxSessions,
      };
    },
    rejectHostKey() {
      this.rejectedHostKeyCount += 1;
    },
    rejectedHostKeyCount: 0,
    resized: [],
    resize(params) {
      this.resized.push(params);
    },
    scrolledRows: [],
    scrollRows(params) {
      this.scrolledRows.push(params.rows);
    },
    snapshot: () => {
      return SNAPSHOT;
    },
    started: [],
    async start(options: SshConnectOptions) {
      this.started.push(options);
      tracked.live = options;
    },
    get status() {
      return tracked.state.status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    writes: [],
    write(sequence: string) {
      this.writes.push(sequence);
    },
  };
};

const createLoaderWith = (options: SshConnectOptions | null) => {
  return jest.fn().mockResolvedValue(options);
};

const createLastSessionStore = () => {
  const sessionNamesById = new Map<string, string>();
  const store: ServerLastSessionStore = {
    async clear({ id }) {
      sessionNamesById.delete(id);
    },
    async find({ id }) {
      return sessionNamesById.get(id) ?? null;
    },
    async save({ id, sessionName }) {
      sessionNamesById.set(id, sessionName);
    },
  };

  return { sessionNamesById, store };
};

type RenderedScreen = Awaited<ReturnType<typeof render>> & { sessionNamesById: Map<string, string> };

const renderScreen = async (
  session: FakeSession,
  options: SshConnectOptions | null = CONNECT_OPTIONS
): Promise<RenderedScreen> => {
  const { sessionNamesById, store } = createLastSessionStore();
  const renderResult = await render(
    <TerminalScreen
      lastSessionStore={store}
      loadConnectOptions={createLoaderWith(options)}
      profileId={PROFILE_ID}
      session={session}
    />
  );

  return { ...renderResult, sessionNamesById };
};

const keyboardShowEvent = (height: number): KeyboardEvent => {
  return {
    endCoordinates: { height, screenX: 0, screenY: 0, width: 359 },
  } as unknown as KeyboardEvent;
};

const captureKeyboardListeners = (): Record<string, (event: KeyboardEvent) => void> => {
  const keyboardListeners: Record<string, (event: KeyboardEvent) => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, handler) => {
    keyboardListeners[eventName] = handler as (event: KeyboardEvent) => void;
    return {
      remove: () => {
        delete keyboardListeners[eventName];
      },
    } as unknown as EmitterSubscription;
  });
  return keyboardListeners;
};

const PORTRAIT_DIMENSIONS = { screen: Dimensions.get('screen'), window: Dimensions.get('window') };

const rotatedToLandscape = (metrics: { height: number; width: number }) => {
  return { ...metrics, height: metrics.width, width: metrics.height };
};

const LANDSCAPE_DIMENSIONS = {
  screen: rotatedToLandscape(PORTRAIT_DIMENSIONS.screen),
  window: rotatedToLandscape(PORTRAIT_DIMENSIONS.window),
};

const flexDirectionOf = (testID: string): unknown => {
  const style = screen.getByTestId(testID).props.style;
  const styles = Array.isArray(style) ? style : [style];
  const directions = styles
    .flatMap((entry) => {
      return typeof entry === 'object' && entry !== null ? entry.flexDirection : undefined;
    })
    .filter((direction) => {
      return direction !== undefined;
    });
  return directions[directions.length - 1];
};

beforeEach(() => {
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.replace).mockClear();
  Dimensions.set(PORTRAIT_DIMENSIONS);
});

afterEach(() => {
  Dimensions.set(PORTRAIT_DIMENSIONS);
});

describe('TerminalScreen mount', () => {
  it('auto-starts the profile connection options when idle', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await waitFor(() => {
      expect(session.started).toHaveLength(1);
    });
    expect(session.started[0]).toEqual(CONNECT_OPTIONS);
  });

  it('redirects to servers when the profile cannot be resolved', async () => {
    const session = createFakeSession();
    await renderScreen(session, null);
    await waitFor(() => {
      expect(router.dismissTo).toHaveBeenCalledWith('/');
    });
    expect(session.started).toHaveLength(0);
  });

  it('does not auto-start when the session is already active', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeTruthy();
    });
    expect(session.started).toHaveLength(0);
  });

  it('shows the profile label in the top bar', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session, { ...CONNECT_OPTIONS, label: 'My build box' });
    await waitFor(() => {
      expect(screen.getByText('My build box')).toBeTruthy();
    });
    expect(screen.queryByText(/My build box \(example.com\)/)).toBeNull();
  });

  it('prefixes the top bar title with the current tmux session name', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxCurrentSessionName = 'work';
    await renderScreen(session, { ...CONNECT_OPTIONS, label: 'My build box' });
    await waitFor(() => {
      expect(screen.getByText('work - My build box')).toBeTruthy();
    });
  });

  it('drops the tmux session prefix from the top bar after detaching', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxCurrentSessionName = 'work';
    session.tmuxSessions = ['work'];
    await renderScreen(session, { ...CONNECT_OPTIONS, label: 'My build box' });
    await waitFor(() => {
      expect(screen.getByText('work - My build box')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await fireEvent.press(screen.getByLabelText('Detach from session'));
    await waitFor(() => {
      expect(screen.getByText('My build box')).toBeTruthy();
    });
  });

  it('shows only the host in the top bar when the label matches the host', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session, { ...CONNECT_OPTIONS, label: 'example.com' });
    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeTruthy();
    });
    expect(screen.queryByText(/example.com \(example.com\)/)).toBeNull();
  });

  it('resumes the live session content when remounted after navigating away', async () => {
    const session = createFakeSession();
    const first = await renderScreen(session);
    await waitFor(() => {
      expect(first.getByText('example.com')).toBeTruthy();
    });
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await act(async () => {
      first.unmount();
    });
    const second = await renderScreen(session);
    await waitFor(() => {
      expect(second.getByText('red')).toBeTruthy();
    });
    expect(second.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(session.started).toHaveLength(1);
  });

  it('starts a fresh connection when the live session belongs to another profile', async () => {
    const otherProfile: SshConnectOptions = { ...CONNECT_OPTIONS, host: 'other.example.com' };
    const session = createFakeSession('connected', otherProfile);
    await renderScreen(session);
    await waitFor(() => {
      expect(session.started).toHaveLength(1);
    });
    expect(session.started[0]).toEqual(CONNECT_OPTIONS);
  });
});

describe('TerminalScreen session states', () => {
  it('shows Connecting while the session connects', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connecting' });
    });
    expect(screen.getByText('Connecting…')).toBeTruthy();
  });

  it('renders terminal rows once connected', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    expect(screen.getByText('red')).toBeTruthy();
    expect(screen.getByRole('button', { name: '↑' })).toBeTruthy();
  });

  it('shows the error headline with Reconnect and Edit on failure', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'error', error: { code: 'network', message: 'unreachable' } });
    });
    expect(screen.getByText('Connection failed: unreachable')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => {
      expect(session.started).toHaveLength(2);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.replace).toHaveBeenCalledWith({ params: { id: PROFILE_ID }, pathname: '/connect' });
  });

  it('shows the fingerprint on a pending host key without Reconnect', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({
        status: 'host-key-changed',
        pendingHostKey: { fingerprint: 'SHA256:abc', hostKeyLine: 'example.com ssh-ed25519 NEW' },
      });
    });
    expect(screen.getByText('Host key has changed')).toBeTruthy();
    expect(screen.getByText('SHA256:abc')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });

  it('accepts a pending host key, persists it, and retries the session', async () => {
    const session = createFakeSession();
    const persistAcceptedHostKey = jest.fn().mockResolvedValue(undefined);
    await render(
      <TerminalScreen
        session={session}
        profileId={PROFILE_ID}
        loadConnectOptions={createLoaderWith(CONNECT_OPTIONS)}
        persistAcceptedHostKey={persistAcceptedHostKey}
      />
    );
    await act(async () => {
      session.emitState({
        status: 'host-key-unknown',
        pendingHostKey: { fingerprint: 'SHA256:abc', hostKeyLine: 'example.com ssh-ed25519 NEW' },
      });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));

    expect(persistAcceptedHostKey).toHaveBeenCalledWith('example.com ssh-ed25519 NEW');
    expect(session.acceptedHostKeyCount).toBe(1);
  });

  it('rejects a pending host key', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({
        status: 'host-key-unknown',
        pendingHostKey: { fingerprint: 'SHA256:abc', hostKeyLine: 'example.com ssh-ed25519 NEW' },
      });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));

    expect(session.rejectedHostKeyCount).toBe(1);
  });

  it('ends the session from the disconnect button after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
    expect(session.endedCount).toBe(0);
    const disconnectButton = alertSpy.mock.calls[0]?.[2]?.[1];
    await act(async () => {
      disconnectButton?.onPress?.();
    });
    expect(session.endedCount).toBe(1);
    await act(async () => {
      session.emitState({ status: 'closed' });
    });
    expect(screen.getByText('Disconnected')).toBeTruthy();
    alertSpy.mockRestore();
  });
});

describe('TerminalScreen input wiring', () => {
  it('writes extra-key sequences through the session', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await fireEvent.press(screen.getByRole('button', { name: '↑' }));
    expect(session.writes).toEqual(['\x1b[A']);
  });

  it('dismisses the keyboard from the toggle button while the keyboard is visible', async () => {
    const keyboardListeners = captureKeyboardListeners();
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
      keyboardListeners.keyboardDidShow?.(keyboardShowEvent(315));
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Toggle keyboard' }));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
    dismissSpy.mockRestore();
  });

  it('requests the hidden input focus from the toggle button while the keyboard is hidden', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Toggle keyboard' }));
    expect(dismissSpy).not.toHaveBeenCalled();
    dismissSpy.mockRestore();
  });

  it('applies a one-shot ctrl modifier to the next extra key and disarms', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'CTRL' }));
    await fireEvent.press(screen.getByRole('button', { name: '/' }));
    await fireEvent.press(screen.getByRole('button', { name: '/' }));
    expect(session.writes).toEqual(['\x0f', '/']);
  });

  it('keeps a locked ctrl modifier armed across uses', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await fireEvent(screen.getByRole('button', { name: 'CTRL' }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: '/' }));
    await fireEvent.press(screen.getByRole('button', { name: '/' }));
    expect(session.writes).toEqual(['\x0f', '\x0f']);
  });
});

describe('TerminalScreen orientation', () => {
  it('keeps the extra keys below the terminal in portrait', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    await waitFor(() => {
      expect(screen.getByTestId('terminal-content')).toBeTruthy();
    });
    expect(flexDirectionOf('terminal-content')).toBeUndefined();
    expect(flexDirectionOf('extra-keys-bar')).toBe('row');
  });

  it('moves the extra keys into a vertical column beside the terminal in landscape', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    await waitFor(() => {
      expect(screen.getByTestId('terminal-content')).toBeTruthy();
    });
    await act(async () => {
      Dimensions.set(LANDSCAPE_DIMENSIONS);
    });
    expect(flexDirectionOf('terminal-content')).toBe('row');
    expect(flexDirectionOf('extra-keys-bar')).toBe('column');
    await act(async () => {
      Dimensions.set(PORTRAIT_DIMENSIONS);
    });
    expect(flexDirectionOf('terminal-content')).toBeUndefined();
    expect(flexDirectionOf('extra-keys-bar')).toBe('row');
  });
});

describe('TerminalScreen resize', () => {
  const areaLayout = (height: number) => {
    return { nativeEvent: { layout: { height, width: 359, x: 0, y: 0 } } };
  };
  const probeLayout = () => {
    return {
      nativeEvent: {
        lines: [
          {
            ascender: 14,
            capHeight: 10,
            descender: 4,
            height: 18,
            text: 'MMMMMMMMMMMMMMMMMMMM',
            width: 160,
            x: 0,
            xHeight: 7,
            y: 0,
          },
        ],
      },
    };
  };

  it('resizes the session from the measured terminal surface and font probe', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    session.emitState({ status: 'connected' });
    await waitFor(() => {
      expect(screen.getByTestId('terminal-scroll')).toBeTruthy();
    });
    await fireEvent(screen.getByTestId('terminal-scroll'), 'layout', areaLayout(631));
    expect(session.resized).toHaveLength(0);
    await fireEvent(screen.getByTestId('terminal-probe'), 'textLayout', probeLayout());
    expect(session.resized).toEqual([{ cols: 44, rows: 35 }]);
  });

  it('re-resizes when the terminal surface relayouts', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    session.emitState({ status: 'connected' });
    await waitFor(() => {
      expect(screen.getByTestId('terminal-scroll')).toBeTruthy();
    });
    await fireEvent(screen.getByTestId('terminal-scroll'), 'layout', areaLayout(631));
    await fireEvent(screen.getByTestId('terminal-probe'), 'textLayout', probeLayout());
    await fireEvent(screen.getByTestId('terminal-scroll'), 'layout', areaLayout(415));
    expect(session.resized).toEqual([
      { cols: 44, rows: 35 },
      { cols: 44, rows: 23 },
    ]);
  });

  it('renders the remote scroll surface when the session owns scrolling', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS, true);
    await renderScreen(session);
    await waitFor(() => {
      expect(screen.getByTestId('terminal-scroll-remote')).toBeTruthy();
    });
    expect(screen.queryByTestId('terminal-scroll')).toBeNull();
  });
});

describe('TerminalScreen keyboard inset', () => {
  describe('screenBottomInsetOf', () => {
    it('adds the navigation-bar inset on android', () => {
      expect(screenBottomInsetOf(315, 27, 'android')).toBe(342);
    });

    it('returns the keyboard height alone on ios', () => {
      expect(screenBottomInsetOf(315, 34, 'ios')).toBe(315);
    });

    it('keeps the keyboard height when android reports no navigation bar', () => {
      expect(screenBottomInsetOf(336, 0, 'android')).toBe(336);
    });
  });

  const renderWithCapturedKeyboardListeners = async () => {
    const keyboardListeners = captureKeyboardListeners();
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    return keyboardListeners;
  };

  const screenPaddingBottom = (): number => {
    const style = StyleSheet.flatten(screen.getByTestId('terminal-screen').props.style);
    return style.paddingBottom;
  };

  const originalOs = Platform.OS;

  afterEach(() => {
    jest.restoreAllMocks();
    mockSafeArea.bottom = 0;
    Platform.OS = originalOs;
  });

  it('pads above the android keyboard by its height plus the navigation-bar inset', async () => {
    mockSafeArea.bottom = 27;
    Platform.OS = 'android';
    const keyboardListeners = await renderWithCapturedKeyboardListeners();
    await act(async () => {
      keyboardListeners.keyboardDidShow?.(keyboardShowEvent(315));
    });
    expect(screenPaddingBottom()).toBe(342);
  });

  it('clears the keyboard padding but keeps the navigation-bar inset when the keyboard hides', async () => {
    mockSafeArea.bottom = 27;
    Platform.OS = 'android';
    const keyboardListeners = await renderWithCapturedKeyboardListeners();
    await act(async () => {
      keyboardListeners.keyboardDidShow?.(keyboardShowEvent(315));
    });
    await act(async () => {
      keyboardListeners.keyboardDidHide?.({} as KeyboardEvent);
    });
    expect(screenPaddingBottom()).toBe(27);
  });

  it('pads by the keyboard height alone on ios', async () => {
    mockSafeArea.bottom = 34;
    Platform.OS = 'ios';
    const keyboardListeners = await renderWithCapturedKeyboardListeners();
    await act(async () => {
      keyboardListeners.keyboardDidShow?.(keyboardShowEvent(291));
    });
    expect(screenPaddingBottom()).toBe(291);
  });
});

describe('TerminalScreen tmux install prompt', () => {
  const promptStateWith = (installCommand: string | null): TerminalSessionState => {
    return { status: 'connected', tmuxPrompt: { installCommand } };
  };

  it('offers to run the install command in the terminal', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState(promptStateWith('sudo apt-get update && sudo apt-get install -y tmux'));
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const alertCall = alertSpy.mock.calls[0];
    expect(alertCall?.[0]).toBe('tmux is not installed');
    expect(alertCall?.[1]).toContain('sudo apt-get install -y tmux');
    const installButton = alertCall?.[2]?.[1];
    await act(async () => {
      installButton?.onPress?.();
    });
    expect(session.writes).toEqual(['sudo apt-get update && sudo apt-get install -y tmux\r']);
    expect(session.dismissedTmuxPromptCount).toBe(1);
    alertSpy.mockRestore();
  });

  it('only dismisses when the user chooses not now', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState(promptStateWith('sudo apk add tmux'));
    });
    const notNowButton = alertSpy.mock.calls[0]?.[2]?.[0];
    await act(async () => {
      notNowButton?.onPress?.();
    });
    expect(session.writes).toEqual([]);
    expect(session.dismissedTmuxPromptCount).toBe(1);
    alertSpy.mockRestore();
  });

  it('falls back to an info-only alert without an install command', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState(promptStateWith(null));
    });
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.text).toBe('OK');
    await act(async () => {
      buttons[0]?.onPress?.();
    });
    expect(session.writes).toEqual([]);
    expect(session.dismissedTmuxPromptCount).toBe(1);
    alertSpy.mockRestore();
  });

  it('does not re-alert for the same prompt object', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    const prompt = { installCommand: 'sudo apk add tmux' };
    await act(async () => {
      session.emitState({ status: 'connected', tmuxPrompt: prompt });
    });
    await act(async () => {
      session.emitState({ status: 'connected', tmuxPrompt: prompt });
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('alerts again for a new prompt after the previous one cleared', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState(promptStateWith('sudo apk add tmux'));
    });
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await act(async () => {
      session.emitState(promptStateWith('sudo dnf install -y tmux'));
    });
    expect(alertSpy).toHaveBeenCalledTimes(2);
    alertSpy.mockRestore();
  });
});

describe('TerminalScreen sessions drawer', () => {
  it('lists the tmux sessions when the hamburger opens the drawer', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work', 'play'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
      expect(screen.getByText('play')).toBeTruthy();
    });
    expect(session.listTmuxSessionsCalls).toBe(2);
  });

  it('marks the attached session as the current one in the drawer', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work', 'play'];
    session.tmuxCurrentSessionName = 'play';
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByTestId('tmux-session-row-play').props.accessibilityState).toEqual({ selected: true });
    });
    expect(screen.getByTestId('tmux-session-row-work').props.accessibilityState).toEqual({ selected: false });
  });

  it('shows the listing error in the drawer when listing fails', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxListError = 'Could not list tmux sessions: tmux in a fresh login shell sees no server';
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText(/sees no server/)).toBeTruthy();
    });
    expect(screen.queryByText('No tmux sessions')).toBeNull();
  });

  it('switches to the selected session and closes the drawer', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('work'));
    expect(session.focusedTmuxSessions).toEqual(['work']);
    expect(session.writes).toEqual([]);
    expect(screen.queryByText('work')).toBeNull();
  });

  it('detaches from the tmux session out of band and closes the drawer', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('Detach from session'));
    expect(session.detachedTmuxCount).toBe(1);
    expect(session.writes).toEqual([]);
    expect(screen.queryByText('work')).toBeNull();
  });

  it('kills the session after confirming and refreshes the drawer list', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work', 'play'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    await fireEvent.press(screen.getByLabelText('Close session work'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    const confirmButton = buttons.find((button) => {
      return button.text === 'Close';
    });
    await act(async () => {
      confirmButton?.onPress?.();
    });
    expect(session.killedTmuxSessions).toEqual(['work']);
    await waitFor(() => {
      expect(screen.queryByText('work')).toBeNull();
    });
    expect(screen.getByText('play')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('renames the session and refreshes the drawer list', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work', 'play'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('Rename session work'));
    await fireEvent.changeText(screen.getByTestId('tmux-rename-session-input'), 'renamed');
    await fireEvent.press(screen.getByText('Rename'));
    expect(session.renamedTmuxSessions).toEqual([{ nextSessionName: 'renamed', sessionName: 'work' }]);
    await waitFor(() => {
      expect(screen.getByText('renamed')).toBeTruthy();
    });
    expect(screen.queryByText('work')).toBeNull();
    expect(screen.getByText('play')).toBeTruthy();
    expect(session.listTmuxSessionsCalls).toBe(3);
  });

  it('keeps the session when closing is cancelled', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    await fireEvent.press(screen.getByLabelText('Close session work'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons[0]?.onPress?.();
    expect(session.killedTmuxSessions).toEqual([]);
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    alertSpy.mockRestore();
  });

  it('closes the drawer from the backdrop without writing', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getAllByLabelText('Close sessions drawer')[0]);
    expect(screen.queryByText('work')).toBeNull();
    expect(session.writes).toEqual([]);
  });

  it('navigates to settings from the drawer footer and closes the drawer', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('Open settings'));
    expect(router.navigate).toHaveBeenCalledWith('/settings');
    expect(screen.queryByText('work')).toBeNull();
  });

  it('shows an empty hint when no tmux sessions exist', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('No tmux sessions')).toBeTruthy();
    });
  });

  it('creates a new session with the next default name and closes the drawer', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['s01'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('s01')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('New session'));
    await fireEvent.press(screen.getByText('Create'));
    expect(session.createdTmuxSessions).toEqual([{ sessionName: 's02', startPath: '' }]);
    await waitFor(() => {
      expect(session.focusedTmuxSessions).toEqual(['s02']);
    });
    expect(session.writes).toEqual([]);
    expect(screen.queryByText('s01')).toBeNull();
  });

  it('creates a new session with the typed name', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['s01'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('s01')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('New session'));
    await fireEvent.changeText(screen.getByTestId('tmux-new-session-name-input'), 'work');
    await fireEvent.press(screen.getByText('Create'));
    expect(session.createdTmuxSessions).toEqual([{ sessionName: 'work', startPath: '' }]);
    await waitFor(() => {
      expect(session.focusedTmuxSessions).toEqual(['work']);
    });
  });

  it('creates a new session in the profile remote path by default', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['s01'];
    await renderScreen(session, { ...CONNECT_OPTIONS, remotePath: '/srv/app' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('s01')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('New session'));
    expect(screen.getByTestId('tmux-new-session-path-input').props.placeholder).toBe('/srv/app');
    await fireEvent.press(screen.getByText('Create'));
    expect(session.createdTmuxSessions).toEqual([{ sessionName: 's02', startPath: '/srv/app' }]);
  });

  it('creates a new session with the typed path', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['s01'];
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('s01')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('New session'));
    await fireEvent.changeText(screen.getByTestId('tmux-new-session-path-input'), '/opt/data');
    await fireEvent.press(screen.getByText('Create'));
    expect(session.createdTmuxSessions).toEqual([{ sessionName: 's02', startPath: '/opt/data' }]);
  });

  it('fills the new session path from the folder browser', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.remoteDirectories = ['app'];
    await renderScreen(session, { ...CONNECT_OPTIONS, remotePath: '/srv' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await fireEvent.press(screen.getByLabelText('New session'));
    await fireEvent.press(screen.getByLabelText('Browse remote folders'));
    await fireEvent.press(await screen.findByText('app'));
    await fireEvent.press(screen.getByText('Use this folder'));

    expect(screen.getByTestId('tmux-new-session-path-input').props.value).toBe('/srv/app');
    expect(session.listRemoteDirectoriesCalls).toEqual([{ path: '/srv' }, { path: '/srv/app' }]);
  });
});

describe('TerminalScreen last tmux session memory', () => {
  it('saves the selected session under its full name for the profile', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work', 'play'];
    const { sessionNamesById } = await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('play'));

    expect(session.focusedTmuxSessions).toEqual(['play']);
    await waitFor(() => {
      expect(sessionNamesById.get(PROFILE_ID)).toBe('play');
    });
  });

  it('saves the session reported as current by the drawer listing', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work', 'play'];
    session.tmuxCurrentSessionName = 'play';
    const { sessionNamesById } = await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));

    await waitFor(() => {
      expect(sessionNamesById.get(PROFILE_ID)).toBe('play');
    });
  });

  it('saves the newly created session once it is focused', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    const { sessionNamesById } = await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(screen.getByText('work')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('New session'));
    await fireEvent.changeText(screen.getByTestId('tmux-new-session-name-input'), 'builds');
    await fireEvent.press(screen.getByText('Create'));

    expect(session.createdTmuxSessions).toEqual([{ sessionName: 'builds', startPath: '' }]);
    await waitFor(() => {
      expect(sessionNamesById.get(PROFILE_ID)).toBe('builds');
    });
  });

  it('clears the remembered session after detaching', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = ['work'];
    session.tmuxCurrentSessionName = 'work';
    const { sessionNamesById } = await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(sessionNamesById.get(PROFILE_ID)).toBe('work');
    });
    await fireEvent.press(screen.getByLabelText('Detach from session'));

    await waitFor(() => {
      expect(sessionNamesById.has(PROFILE_ID)).toBe(false);
    });
  });

  it('keeps the remembered session when the listing reports no sessions', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    session.tmuxSessions = [];
    const { sessionNamesById } = await renderScreen(session);
    sessionNamesById.set(PROFILE_ID, 'work');
    await fireEvent.press(screen.getByRole('button', { name: 'Sessions' }));
    await waitFor(() => {
      expect(session.listTmuxSessionsCalls).toBe(2);
    });

    expect(sessionNamesById.get(PROFILE_ID)).toBe('work');
  });
});

describe('TerminalScreen disconnect', () => {
  it('keeps the session when disconnect is canceled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
    const cancelButton = alertSpy.mock.calls[0]?.[2]?.[0];
    await act(async () => {
      cancelButton?.onPress?.();
    });
    expect(session.endedCount).toBe(0);
    expect(router.dismissTo).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('ends the session and returns to the server list on confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return undefined;
    });
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);
    await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
    const disconnectButton = alertSpy.mock.calls[0]?.[2]?.[1];
    await act(async () => {
      disconnectButton?.onPress?.();
    });
    expect(session.endedCount).toBe(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    alertSpy.mockRestore();
  });
});

describe('TerminalScreen remote close', () => {
  it('returns to the server list when the session closes on its own', async () => {
    const session = createFakeSession();
    await renderScreen(session);
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await act(async () => {
      session.emitState({ status: 'closed' });
    });
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it('does not restart the default-loaded session after it closes', async () => {
    jest.mocked(serverConnectOptions.build).mockResolvedValue(CONNECT_OPTIONS);
    const session = createFakeSession();
    await render(<TerminalScreen session={session} profileId={PROFILE_ID} />);
    await waitFor(() => {
      expect(session.started).toHaveLength(1);
    });
    await act(async () => {
      session.emitState({ status: 'connected' });
    });
    await act(async () => {
      session.emitState({ status: 'closed' });
    });
    expect(session.started).toHaveLength(1);
  });
});

describe('TerminalScreen font size preference', () => {
  const touchAt = (pageX: number, pageY: number) => {
    return {
      currentTimeStamp: 100,
      currentPageX: pageX,
      currentPageY: pageY,
      previousPageX: pageX,
      previousPageY: pageY,
      touchActive: true,
    };
  };

  const createTerminalStorage = (initialValue: string | null = null) => {
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

  it('renders the persisted font size on the terminal probe', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await render(
      <TerminalPreferenceProvider storage={createTerminalStorage('{"fontSize":"xl"}')}>
        <TerminalScreen session={session} profileId={PROFILE_ID} loadConnectOptions={createLoaderWith(CONNECT_OPTIONS)} />
      </TerminalPreferenceProvider>,
    );

    await waitFor(() => {
      expect(StyleSheet.flatten(screen.getByTestId('terminal-probe').props.style).fontSize).toBe(18);
    });
  });

  it('defaults to the medium font size without a preference provider', async () => {
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await renderScreen(session);

    await waitFor(() => {
      expect(screen.getByText('red')).toBeTruthy();
    });

    expect(StyleSheet.flatten(screen.getByTestId('terminal-probe').props.style).fontSize).toBe(14);
  });

  it('steps the font size with a pinch gesture and persists it', async () => {
    const terminalStorage = createTerminalStorage();
    const session = createFakeSession('connected', CONNECT_OPTIONS);
    await render(
      <TerminalPreferenceProvider storage={terminalStorage}>
        <TerminalScreen session={session} profileId={PROFILE_ID} loadConnectOptions={createLoaderWith(CONNECT_OPTIONS)} />
      </TerminalPreferenceProvider>,
    );

    const terminalArea = screen.getByTestId('terminal-area');
    terminalArea.props.onResponderGrant({
      nativeEvent: {
        touches: [
          { pageX: 0, pageY: 0 },
          { pageX: 100, pageY: 0 },
        ],
      },
      touchHistory: {
        indexOfSingleActiveTouch: -1,
        mostRecentTimeStamp: 100,
        numberActiveTouches: 2,
        touchBank: [touchAt(0, 0), touchAt(100, 0)],
      },
    });
    await act(async () => {
      terminalArea.props.onResponderMove({
        nativeEvent: {
          touches: [
            { pageX: 0, pageY: 0 },
            { pageX: 125, pageY: 0 },
          ],
        },
        touchHistory: {
          indexOfSingleActiveTouch: -1,
          mostRecentTimeStamp: 101,
          numberActiveTouches: 2,
          touchBank: [touchAt(0, 0), touchAt(125, 0)],
        },
      });
    });

    await waitFor(() => {
      expect(terminalStorage.getWrites()).toEqual([
        JSON.stringify({ fontSize: 'l', isSelectionFollowFingerEnabled: false }),
      ]);
    });
    expect(StyleSheet.flatten(screen.getByTestId('terminal-probe').props.style).fontSize).toBe(16);
  });
});

describe('TerminalScreen selection', () => {
  beforeEach(() => {
    jest.mocked(Clipboard.setStringAsync).mockClear();
  });

  it('starts a selection from the toolbar, highlights it and copies it to the clipboard', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockClear();
    const session = createFakeSession();
    await renderScreen(session);
    session.emitState({ status: 'connected' });
    await waitFor(() => {
      expect(screen.getByTestId('terminal-scroll')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Extra key layers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Extra key layers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start selection' }));
    await waitFor(() => {
      expect(dismissSpy).toHaveBeenCalled();
    });
    expect(screen.getByText('r').props.style.backgroundColor).toBe(constant.terminal.selection.fromActiveBg);
    expect(screen.getByText('e').props.style.backgroundColor).toBe(constant.terminal.selection.bg);
    expect(screen.getByText('d').props.style.backgroundColor).toBe(constant.terminal.selection.toBg);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(screen.getByText('red').props.style.backgroundColor).toBe(constant.terminal.bg);
    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Extra key layers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Extra key layers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start selection' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Accept selection' }));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('red');
    });
    expect(screen.getByText('red').props.style.backgroundColor).toBe(constant.terminal.bg);
  });
});
