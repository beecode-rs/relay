import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
  useFonts,
} from '@expo-google-fonts/jetbrains-mono';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { KeyboardEvent, TextLayoutEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { constant } from '@/constants/constant';
import { useOptionalTerminalPreference } from '@/components/terminal-preference-context';
import { charMetrics } from '@/features/terminal/char-metrics';
import { ExtraKeysRow } from '@/features/terminal/extra-keys-row';
import { HiddenKeyboardInput } from '@/features/terminal/hidden-keyboard-input';
import type { TerminalInputRef } from '@/features/terminal/hidden-keyboard-input';
import type { TerminalModifierName } from '@/features/terminal/modifier-input';
import { ServersDrawer } from '@/features/terminal/servers-drawer';
import type { ServersDrawerServer } from '@/features/terminal/servers-drawer';
import { TerminalView } from '@/features/terminal/terminal-view';
import { usePinchFontSize } from '@/features/terminal/use-pinch-font-size';
import { useTerminalSelection } from '@/features/terminal/use-terminal-selection';
import { serverConnectOptions } from '@/services/connection/connect-options';
import { serverLastSessionStore } from '@/services/connection/server-last-session-store';
import type { ServerLastSessionStore } from '@/services/connection/server-last-session-store';
import { mergeAcceptedHostKey } from '@/services/connection/server-profile';
import type { ServerProfile } from '@/services/connection/server-profile';
import { serverProfileStore } from '@/services/connection/server-profile-store';
import { activeServerStore as defaultActiveServerStore } from '@/services/connection/active-server-store';
import type { ActiveServerStore } from '@/services/connection/active-server-store';
import { terminalSessionRegistry } from '@/services/terminal/terminal-session-registry';
import type {
  TerminalSession,
  TerminalSessionState,
  TmuxSessionListResult,
  TmuxPrompt,
} from '@/services/terminal/terminal-session';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import { DEFAULT_TERMINAL_PREFERENCE } from '@/services/terminal/terminal-preference';
import type { FontSizeStepDirection } from '@/services/terminal/terminal-preference';
import { TerminalPreferenceService } from '@/services/terminal/terminal-preference-service';
import { tmuxAttachUtil } from '@/services/terminal/tmux-attach';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

export type TerminalScreenSession = Pick<
  TerminalSession,
  | 'acceptHostKey'
  | 'cloneTmuxSession'
  | 'createTmuxSession'
  | 'currentState'
  | 'detachTmuxSession'
  | 'dismissTmuxPrompt'
  | 'drainPendingOutput'
  | 'end'
  | 'focusTmuxSession'
  | 'isApplicationCursorKeys'
  | 'isActiveFor'
  | 'isRemoteScrollEnabled'
  | 'killTmuxSession'
  | 'listRemoteDirectories'
  | 'listTmuxSessions'
  | 'rejectHostKey'
  | 'renameTmuxSession'
  | 'resize'
  | 'scrollRows'
  | 'snapshot'
  | 'start'
  | 'status'
  | 'subscribe'
  | 'write'
>;

export type TerminalScreenRegistryEntry = {
  profileId: string;
  connectOptions: SshConnectOptions;
  session: TerminalScreenSession;
};

export type TerminalScreenRegistry = {
  list(): TerminalScreenRegistryEntry[];
  find(profileId: string): TerminalScreenRegistryEntry | null;
  ensureStarted(params: {
    profileId: string;
    connectOptions: SshConnectOptions;
  }): Promise<TerminalScreenRegistryEntry>;
  disconnect(profileId: string): void;
  subscribe(listener: () => void): () => void;
};

export type ConnectOptionsLoader = (params: { id: string }) => Promise<SshConnectOptions | null>;

export type TerminalScreenProfile = Pick<ServerProfile, 'host' | 'id' | 'label' | 'remotePath'>;

export type ServerProfileLister = () => Promise<TerminalScreenProfile[]>;

export type ServerProfileRemover = (params: { id: string }) => Promise<void>;

export type TerminalScreenProps = {
  registry?: TerminalScreenRegistry;
  loadConnectOptions?: ConnectOptionsLoader;
  listProfiles?: ServerProfileLister;
  removeProfile?: ServerProfileRemover;
  activeServerStore?: ActiveServerStore;
  persistAcceptedHostKey?: (hostKeyLine: string) => Promise<void>;
  lastSessionStore?: ServerLastSessionStore;
};

type TerminalAreaSize = { heightPx: number; widthPx: number };
type ProbeMetrics = { lineHeightPx: number; widthPx: number };

type TmuxListingState = {
  sessionNames: string[];
  currentSessionName: string | null;
  isLoading: boolean;
  error: string | null;
};

const OUTPUT_TICK_MS = 32;
const KEYBOARD_REFOCUS_DELAY_MS = 100;

const EMPTY_SNAPSHOT: TerminalSnapshot = {
  rows: [],
  cursor: { x: 0, y: 0 },
  firstLine: 0,
  isAlternateBuffer: false,
  viewportRowCount: 0,
};

const EMPTY_TMUX_LISTING: TmuxListingState = {
  sessionNames: [],
  currentSessionName: null,
  isLoading: false,
  error: null,
};

const statusDotColorOf = (status: TerminalSessionState['status']): string => {
  if (status === 'connected') {
    return '#4caf50';
  }
  if (status === 'connecting') {
    return '#ffc107';
  }
  if (status === 'closed') {
    return '#9e9e9e';
  }
  return '#f44336';
};

const statusHeadlineOf = (state: TerminalSessionState): string => {
  if (state.status === 'connecting') {
    return 'Connecting…';
  }
  if (state.status === 'error') {
    return `Connection failed: ${state.error?.message ?? 'unknown error'}`;
  }
  if (state.status === 'host-key-unknown') {
    return 'Host key is unknown';
  }
  if (state.status === 'host-key-changed') {
    return 'Host key has changed';
  }
  return 'Disconnected';
};

const toServerDisplayNameOf = (options: SshConnectOptions): string => {
  if (options.label === undefined || options.label === '' || options.label === options.host) {
    return options.host;
  }
  return options.label;
};

const topBarTitleOf = (options: SshConnectOptions, currentSessionName: string | null): string => {
  const serverName = toServerDisplayNameOf(options);
  if (currentSessionName === null) {
    return serverName;
  }
  return `${currentSessionName} - ${serverName}`;
};

const toDrawerServerStatus = (status: TerminalSessionState['status']): ServersDrawerServer['status'] => {
  if (
    status === 'connected' ||
    status === 'connecting' ||
    status === 'host-key-unknown' ||
    status === 'host-key-changed' ||
    status === 'error'
  ) {
    return status;
  }
  return 'connecting';
};

const defaultLoadConnectOptions: ConnectOptionsLoader = (params) => {
  return serverConnectOptions.build(params);
};

const defaultListProfiles: ServerProfileLister = async () => {
  return serverProfileStore.list();
};

const defaultRemoveProfile: ServerProfileRemover = (params) => {
  return serverProfileStore.remove(params);
};

export const screenBottomInsetOf = (keyboardHeight: number, navigationBarInset: number, os: string): number => {
  if (os !== 'android') {
    return keyboardHeight;
  }
  return keyboardHeight + navigationBarInset;
};

type TerminalStatusViewProps = {
  onAcceptHostKey(): void;
  onEdit(): void;
  onRejectHostKey(): void;
  onReconnect(): void;
  state: TerminalSessionState;
};

function TerminalStatusView({ onAcceptHostKey, onEdit, onRejectHostKey, onReconnect, state }: TerminalStatusViewProps) {
  const isReconnectable = state.status === 'closed' || state.status === 'error';
  const hasPendingHostKey = state.pendingHostKey !== undefined;
  return (
    <View style={styles.statusContainer}>
      <Text style={styles.statusText}>{statusHeadlineOf(state)}</Text>
      {state.pendingHostKey !== undefined ? (
        <Text style={styles.statusDetail}>{state.pendingHostKey.fingerprint}</Text>
      ) : null}
      <View style={styles.statusActions}>
        {hasPendingHostKey ? (
          <>
            <Pressable accessibilityRole="button" onPress={onRejectHostKey} style={styles.statusButton}>
              <Text style={styles.statusButtonText}>Reject</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onAcceptHostKey}
              style={[styles.statusButton, styles.reconnectButton]}
            >
              <Text style={styles.statusButtonText}>Accept</Text>
            </Pressable>
          </>
        ) : null}
        {isReconnectable ? (
          <Pressable
            accessibilityRole="button"
            onPress={onReconnect}
            style={[styles.statusButton, styles.reconnectButton]}
          >
            <Text style={styles.statusButtonText}>Reconnect</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.statusButton}>
          <Text style={styles.statusButtonText}>Edit</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TerminalScreen({
  registry = terminalSessionRegistry,
  loadConnectOptions = defaultLoadConnectOptions,
  listProfiles = defaultListProfiles,
  removeProfile = defaultRemoveProfile,
  activeServerStore = defaultActiveServerStore,
  persistAcceptedHostKey,
  lastSessionStore = serverLastSessionStore,
}: TerminalScreenProps) {
  const [isFontsLoaded] = useFonts({ JetBrainsMono_400Regular, JetBrainsMono_700Bold });
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);
  const [terminalTarget, setTerminalTarget] = useState<TerminalScreenRegistryEntry | null>(null);
  const [registryEntries, setRegistryEntries] = useState<TerminalScreenRegistryEntry[]>(() => {
    return registry.list();
  });
  const [savedProfiles, setSavedProfiles] = useState<TerminalScreenProfile[]>([]);
  const [sessionState, setSessionState] = useState<TerminalSessionState>(() => {
    return { status: 'idle' };
  });
  const [snapshot, setSnapshot] = useState<TerminalSnapshot>(() => {
    return EMPTY_SNAPSHOT;
  });
  const [tmuxListings, setTmuxListings] = useState<Record<string, TmuxListingState>>({});
  const [armedModifier, setArmedModifier] = useState<TerminalModifierName | null>(null);
  const [isModifierLocked, setIsModifierLocked] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardInsetHeight, setKeyboardInsetHeight] = useState(0);
  const [availableSize, setAvailableSize] = useState<TerminalAreaSize | null>(null);
  const [probeMetrics, setProbeMetrics] = useState<ProbeMetrics | null>(null);
  const [followRequestCount, setFollowRequestCount] = useState(0);
  const inputRef = useRef<TerminalInputRef | null>(null);
  const shownTmuxPromptRef = useRef<TmuxPrompt | null>(null);
  const safeAreaInsets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const isLandscape = windowDimensions.width > windowDimensions.height;

  const terminalPreference = useOptionalTerminalPreference();
  const preference = terminalPreference?.preference ?? DEFAULT_TERMINAL_PREFERENCE;
  const terminalPreferenceService = useMemo(() => {
    return new TerminalPreferenceService();
  }, []);
  const fontSize = terminalPreferenceService.resolveFontSizePx({ option: preference.fontSize });

  const keyboardInsetStyle = {
    paddingBottom: screenBottomInsetOf(keyboardInsetHeight, safeAreaInsets.bottom, Platform.OS),
  };

  const landscapeInsetStyle = isLandscape
    ? { paddingLeft: safeAreaInsets.left, paddingRight: safeAreaInsets.right }
    : undefined;

  const fontFamily = isFontsLoaded ? 'JetBrainsMono_400Regular' : 'monospace';
  const boldFontFamily = isFontsLoaded ? 'JetBrainsMono_700Bold' : 'monospace';
  const lineHeight = probeMetrics?.lineHeightPx ?? Math.round(fontSize * 1.3);

  // Kept in sync for the focus-resolution below, which must not depend on the
  // target itself: a stable callback keeps a drawer server switch from being
  // overridden by a re-resolve with the not-yet-saved previous selection.
  const terminalTargetRef = useRef<TerminalScreenRegistryEntry | null>(null);
  useEffect(() => {
    terminalTargetRef.current = terminalTarget;
  }, [terminalTarget]);

  // The drawer lists every saved instance, connected or not, so the profile
  // list is reloaded whenever it can change: focus (add/edit/remove return)
  // and drawer open.
  const reloadProfiles = useCallback(async (): Promise<TerminalScreenProfile[]> => {
    const profiles = await listProfiles();
    setSavedProfiles(profiles);

    return profiles;
  }, [listProfiles]);

  // Resolve which instance the terminal should show: the remembered active
  // one, falling back to the first instance with loadable credentials. Runs on
  // mount and whenever the screen regains focus.
  const resolveActiveServer = useCallback(async () => {
    const storedId = await activeServerStore.find();
    // Selection unchanged: keep whatever the terminal currently shows, be it a
    // live session or a disconnected one waiting for a manual reconnect.
    const currentTarget = terminalTargetRef.current;
    if (storedId !== null && currentTarget !== null && currentTarget.profileId === storedId) {
      return;
    }
    const profiles = await reloadProfiles();
    const candidateIds = storedId !== null
      ? [
          storedId,
          ...profiles
            .map((profile) => {
              return profile.id;
            })
            .filter((id) => {
              return id !== storedId;
            }),
        ]
      : profiles.map((profile) => {
          return profile.id;
        });
    for (const candidateId of candidateIds) {
      const options = await loadConnectOptions({ id: candidateId });
      if (options === null) {
        continue;
      }
      const entry = await registry.ensureStarted({ profileId: candidateId, connectOptions: options });
      setIsSetupNeeded(false);
      setHasCheckedProfile(true);
      setTerminalTarget(entry);
      return;
    }
    setTerminalTarget(null);
    setIsSetupNeeded(true);
    setHasCheckedProfile(true);
  }, [activeServerStore, loadConnectOptions, reloadProfiles, registry]);

  useFocusEffect(
    useCallback(() => {
      void resolveActiveServer();
    }, [resolveActiveServer])
  );

  // Remember the active server so the next launch reopens it directly.
  useEffect(() => {
    if (terminalTarget === null) {
      return;
    }
    void activeServerStore.save({ id: terminalTarget.profileId });
  }, [terminalTarget, activeServerStore]);

  const activeSession = terminalTarget?.session ?? null;

  // The active server's connection is gone (disconnect or remote close): show
  // the next connected server; otherwise keep the disconnected one so its
  // status view can offer a manual reconnect.
  useEffect(() => {
    const handleRegistryChange = () => {
      const entries = registry.list();
      setRegistryEntries(entries);
      if (terminalTarget === null) {
        return;
      }
      const isEntryAlive = entries.some((entry) => {
        return entry.profileId === terminalTarget.profileId;
      });
      if (isEntryAlive) {
        return;
      }
      const nextEntry = entries.find((entry) => {
        return entry.session.status === 'connected';
      });
      if (nextEntry !== undefined) {
        setTerminalTarget(nextEntry);
      }
    };
    return registry.subscribe(handleRegistryChange);
  }, [registry, terminalTarget]);

  // Reset the terminal view when the active session itself changes; later
  // state arrives through the subscription below.
  const [watchedSession, setWatchedSession] = useState<TerminalScreenSession | null>(null);
  if (watchedSession !== activeSession) {
    setWatchedSession(activeSession);
    setSessionState(activeSession?.currentState ?? { status: 'idle' });
    setSnapshot(activeSession?.snapshot() ?? EMPTY_SNAPSHOT);
  }

  useEffect(() => {
    if (activeSession === null) {
      return;
    }
    return activeSession.subscribe((state) => {
      setSessionState(state);
    });
  }, [activeSession]);

  useEffect(() => {
    const pullOutput = () => {
      // Background servers keep producing output; drain every batcher so they
      // do not grow without bound, but only re-render for the active terminal.
      registry.list().forEach((entry) => {
        const output = entry.session.drainPendingOutput();
        if (output === null) {
          return;
        }
        if (entry.session !== activeSession) {
          return;
        }
        setSnapshot(entry.session.snapshot());
        setTimeout(() => {
          setSnapshot(entry.session.snapshot());
        }, 0);
      });
    };
    const timer = setInterval(pullOutput, OUTPUT_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [registry, activeSession]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      setIsKeyboardVisible(true);
      setKeyboardInsetHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      setKeyboardInsetHeight(0);
      // Holding focus without a visible IME blocks ScrollView touch dispatch on
      // Android, so release the hidden input whenever the keyboard closes.
      inputRef.current?.blur();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (probeMetrics === null || availableSize === null || activeSession === null) {
      return;
    }
    const grid = charMetrics.gridSizeFromProbe({
      availableHeightPx: availableSize.heightPx,
      availableWidthPx: availableSize.widthPx,
      probeCharCount: constant.terminal.gridProbe.charCount,
      probeLineHeightPx: probeMetrics.lineHeightPx,
      probeWidthPx: probeMetrics.widthPx,
    });
    activeSession.resize({ cols: grid.cols, rows: grid.rows });
  }, [availableSize, probeMetrics, activeSession]);

  // Grid sizing must come from the surface that renders the rows - the outer
  // terminal area can report a taller first layout before sibling views settle,
  // which overstated the row count and cut the bottom rows off below the fold.
  const handleViewportLayout = (size: { heightPx: number; widthPx: number }) => {
    setAvailableSize(size);
  };

  const handleProbeTextLayout = (event: TextLayoutEvent) => {
    const line = event.nativeEvent.lines[0];
    if (line === undefined) {
      return;
    }
    setProbeMetrics({ lineHeightPx: line.height, widthPx: line.width });
  };

  const showKeyboard = () => {
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    input.blur();
    setTimeout(() => {
      input.focus();
    }, KEYBOARD_REFOCUS_DELAY_MS);
  };

  const handleToggleKeyboard = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    showKeyboard();
  };

  const handleModifierTap = (modifier: TerminalModifierName) => {
    if (armedModifier === modifier) {
      setArmedModifier(null);
      setIsModifierLocked(false);
      return;
    }
    setArmedModifier(modifier);
    setIsModifierLocked(false);
  };

  const handleModifierLongPress = (modifier: TerminalModifierName) => {
    setArmedModifier(modifier);
    setIsModifierLocked(true);
  };

  const handleModifierUsed = () => {
    if (!isModifierLocked) {
      setArmedModifier(null);
    }
  };

  const handleWrite = (sequence: string) => {
    setFollowRequestCount((count) => {
      return count + 1;
    });
    activeSession?.write(sequence);
  };

  const handleFontSizeStep = useCallback(
    (params: { direction: FontSizeStepDirection }) => {
      const nextFontSize = terminalPreferenceService.stepFontSize({
        direction: params.direction,
        option: preference.fontSize,
      });
      if (nextFontSize === preference.fontSize) {
        return;
      }
      void terminalPreference?.savePreference({ ...preference, fontSize: nextFontSize });
    },
    [preference, terminalPreference, terminalPreferenceService]
  );

  const pinchPanHandlers = usePinchFontSize({ onStep: handleFontSizeStep });

  const handleScrollRows = (params: { rows: number }) => {
    activeSession?.scrollRows({ rows: params.rows });
  };

  const terminalSelection = useTerminalSelection({
    onCopyText: async (text: string): Promise<void> => {
      await Clipboard.setStringAsync(text);
    },
    snapshot,
  });

  const isSelectionActive = terminalSelection.selection !== null;

  // Selecting is a read-only gesture over the terminal, so drop the keyboard
  // for it no matter how the mode was entered - toolbar toggle or long-press.
  useEffect(() => {
    if (!isSelectionActive) {
      return;
    }
    Keyboard.dismiss();
  }, [isSelectionActive]);

  const charWidthPx =
    probeMetrics !== null ? probeMetrics.widthPx / constant.terminal.gridProbe.charCount : fontSize * 0.6;

  const handleSelectionToggle = useCallback(() => {
    if (terminalSelection.selection !== null) {
      terminalSelection.cancel();
      return;
    }
    setFollowRequestCount((count) => {
      return count + 1;
    });
    terminalSelection.startFromLastWord();
  }, [terminalSelection]);

  useEffect(() => {
    const tmuxPrompt = sessionState.tmuxPrompt;
    if (tmuxPrompt === undefined) {
      shownTmuxPromptRef.current = null;
      return;
    }
    if (shownTmuxPromptRef.current === tmuxPrompt) {
      return;
    }
    shownTmuxPromptRef.current = tmuxPrompt;
    const dismiss = () => {
      activeSession?.dismissTmuxPrompt();
    };
    const installCommand = tmuxPrompt.installCommand;
    if (installCommand === null) {
      Alert.alert(
        'tmux is not installed',
        'tmux keeps terminal sessions alive on the instance. Install it with this system package manager, then reconnect.',
        [{ onPress: dismiss, text: 'OK' }]
      );
      return;
    }
    Alert.alert(
      'tmux is not installed',
      `tmux keeps terminal sessions alive on the instance.\n\nInstall it now? This runs in the terminal and may ask for your password:\n${installCommand}`,
      [
        { onPress: dismiss, style: 'cancel', text: 'Not now' },
        {
          onPress: () => {
            // Write to the session that raised the prompt, even if the user
            // switched servers while the alert was open.
            setFollowRequestCount((count) => {
              return count + 1;
            });
            activeSession?.write(`${installCommand}\r`);
            dismiss();
          },
          text: 'Install',
        },
      ]
    );
  }, [activeSession, sessionState.tmuxPrompt]);

  const handleDisconnect = () => {
    if (terminalTarget === null) {
      return;
    }
    const profileId = terminalTarget.profileId;
    Alert.alert(
      'Disconnect',
      `Close the connection to ${terminalTarget.connectOptions.host}?`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            registry.disconnect(profileId);
          },
          style: 'destructive',
          text: 'Disconnect',
        },
      ]
    );
  };

  const rememberLastTmuxSession = useCallback(
    (targetProfileId: string, sessionName: string | null) => {
      if (sessionName === null) {
        void lastSessionStore.clear({ id: targetProfileId });
        return;
      }
      void lastSessionStore.save({ id: targetProfileId, sessionName });
    },
    [lastSessionStore]
  );

  const applyTmuxListResult = useCallback(
    (targetProfileId: string, result: TmuxSessionListResult) => {
      setTmuxListings((previous) => {
        if (result.kind === 'error') {
          return {
            ...previous,
            [targetProfileId]: {
              ...(previous[targetProfileId] ?? EMPTY_TMUX_LISTING),
              sessionNames: [],
              currentSessionName: null,
              error: result.message,
            },
          };
        }
        return {
          ...previous,
          [targetProfileId]: {
            ...(previous[targetProfileId] ?? EMPTY_TMUX_LISTING),
            sessionNames: result.sessionNames,
            currentSessionName: result.currentSessionName,
            error: null,
          },
        };
      });
      if (result.kind === 'sessions' && result.sessionNames.length > 0) {
        rememberLastTmuxSession(targetProfileId, result.currentSessionName);
      }
    },
    [rememberLastTmuxSession]
  );

  const refreshTmuxListing = useCallback(
    (targetProfileId: string) => {
      const entry = registry.find(targetProfileId);
      if (entry === null) {
        return;
      }
      setTmuxListings((previous) => {
        return {
          ...previous,
          [targetProfileId]: {
            ...(previous[targetProfileId] ?? EMPTY_TMUX_LISTING),
            isLoading: true,
          },
        };
      });
      void entry.session
        .listTmuxSessions()
        .then((result) => {
          applyTmuxListResult(targetProfileId, result);
        })
        .finally(() => {
          setTmuxListings((previous) => {
            const listing = previous[targetProfileId];
            if (listing === undefined) {
              return previous;
            }
            return { ...previous, [targetProfileId]: { ...listing, isLoading: false } };
          });
        });
    },
    [applyTmuxListResult, registry]
  );

  // tmux auto-attaches in the shell right after connect; refresh the active
  // listing once so the top bar shows the attached session name.
  useEffect(() => {
    if (sessionState.status !== 'connected' || terminalTarget === null || activeSession === null) {
      return;
    }
    void activeSession.listTmuxSessions().then((result) => {
      applyTmuxListResult(terminalTarget.profileId, result);
    });
  }, [applyTmuxListResult, terminalTarget, activeSession, sessionState.status]);

  const handleOpenDrawer = () => {
    setIsDrawerOpen(true);
    void reloadProfiles();
    registry.list().forEach((entry) => {
      if (entry.session.status === 'connected') {
        refreshTmuxListing(entry.profileId);
      }
    });
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleOpenSettings = () => {
    setIsDrawerOpen(false);
    router.navigate('/settings');
  };

  const handleAddServer = () => {
    setIsDrawerOpen(false);
    router.push('/connect');
  };

  const handleDrawerEditServer = (targetProfileId: string) => {
    setIsDrawerOpen(false);
    router.push({ params: { id: targetProfileId }, pathname: '/connect' });
  };

  // Selecting an instance row shows its detached terminal: a saved-but-not-
  // connected instance is started first, then tmux is detached to the raw shell.
  const handleDrawerSelectServer = (targetProfileId: string) => {
    setIsDrawerOpen(false);
    const entry = registry.find(targetProfileId);
    if (entry !== null) {
      selectServerEntry(entry, false);
      return;
    }
    const start = async (): Promise<TerminalScreenRegistryEntry | null> => {
      const options = await loadConnectOptions({ id: targetProfileId });
      if (options === null) {
        return null;
      }
      try {
        return await registry.ensureStarted({ profileId: targetProfileId, connectOptions: options });
      } catch {
        return null;
      }
    };
    void start().then((startedEntry) => {
      if (startedEntry !== null) {
        selectServerEntry(startedEntry, true);
      }
    });
  };

  const selectServerEntry = (entry: TerminalScreenRegistryEntry, wasStartedNow: boolean) => {
    setTerminalTarget(entry);
    setIsSetupNeeded(false);
    // The instance row is the "machine" view: detach tmux and show the raw shell.
    void (async () => {
      if (wasStartedNow) {
        // A fresh connection may still be auto-attaching its remembered tmux
        // session; let that settle before detaching to the raw shell.
        applyTmuxListResult(entry.profileId, await entry.session.listTmuxSessions());
      }
      const wasDetached = await entry.session.detachTmuxSession();
      if (!wasDetached) {
        return;
      }
      setTmuxListings((previous) => {
        const listing = previous[entry.profileId];
        if (listing === undefined) {
          return previous;
        }
        return { ...previous, [entry.profileId]: { ...listing, currentSessionName: null } };
      });
      rememberLastTmuxSession(entry.profileId, null);
    })();
  };

  const setCurrentTmuxSession = (targetProfileId: string, sessionName: string) => {
    setTmuxListings((previous) => {
      const listing = previous[targetProfileId];
      if (listing === undefined) {
        return previous;
      }
      return { ...previous, [targetProfileId]: { ...listing, currentSessionName: sessionName } };
    });
  };

  const handleDrawerSelectSession = (targetProfileId: string, sessionName: string) => {
    setIsDrawerOpen(false);
    const entry = registry.find(targetProfileId);
    if (entry === null) {
      return;
    }
    setTerminalTarget(entry);
    void entry.session.focusTmuxSession({ sessionName }).then((wasFocused) => {
      if (wasFocused) {
        setCurrentTmuxSession(targetProfileId, sessionName);
        rememberLastTmuxSession(targetProfileId, sessionName);
      }
    });
  };

  const handleDrawerDeleteSession = (targetProfileId: string, sessionName: string) => {
    const entry = registry.find(targetProfileId);
    if (entry === null) {
      return;
    }
    void entry.session.killTmuxSession({ sessionName }).then((wasKilled) => {
      if (wasKilled) {
        refreshTmuxListing(targetProfileId);
      }
    });
  };

  const handleDrawerRenameSession = (
    targetProfileId: string,
    sessionName: string,
    nextSessionName: string
  ) => {
    const entry = registry.find(targetProfileId);
    if (entry === null) {
      return;
    }
    void entry.session.renameTmuxSession({ nextSessionName, sessionName }).then((wasRenamed) => {
      if (wasRenamed) {
        refreshTmuxListing(targetProfileId);
      }
    });
  };

  const handleDrawerCloneSession = (targetProfileId: string, sessionName: string) => {
    const entry = registry.find(targetProfileId);
    if (entry === null) {
      return;
    }
    const nextSessionName = tmuxAttachUtil.toCloneSessionName({
      sessionName,
      sessionNames: tmuxListings[targetProfileId]?.sessionNames ?? [],
    });
    void entry.session.cloneTmuxSession({ nextSessionName, sessionName }).then((wasCloned) => {
      if (wasCloned) {
        refreshTmuxListing(targetProfileId);
      }
    });
  };

  const handleDrawerCreateSession = (
    targetProfileId: string,
    sessionName: string,
    remotePath: string
  ) => {
    setIsDrawerOpen(false);
    const entry = registry.find(targetProfileId);
    if (entry === null) {
      return;
    }
    setTerminalTarget(entry);
    void entry.session
      .createTmuxSession({ sessionName, startPath: remotePath })
      .then((wasCreated) => {
        if (!wasCreated) {
          return false;
        }
        return entry.session.focusTmuxSession({ sessionName });
      })
      .then((wasFocused) => {
        if (wasFocused) {
          setCurrentTmuxSession(targetProfileId, sessionName);
          rememberLastTmuxSession(targetProfileId, sessionName);
        }
      });
  };

  const handleDrawerDisconnectServer = (targetProfileId: string) => {
    if (terminalTarget !== null && targetProfileId === terminalTarget.profileId) {
      setIsDrawerOpen(false);
    }
    registry.disconnect(targetProfileId);
  };

  // Removing an instance deletes the profile and its credentials; a live
  // connection is closed first, and when the active instance is removed the
  // terminal re-resolves to the next remaining one.
  const handleDrawerRemoveServer = (targetProfileId: string) => {
    const wasActive = terminalTarget !== null && targetProfileId === terminalTarget.profileId;
    if (wasActive) {
      setIsDrawerOpen(false);
    }
    registry.disconnect(targetProfileId);
    void removeProfile({ id: targetProfileId })
      .then(async () => {
        const activeId = await activeServerStore.find();
        if (activeId === targetProfileId) {
          await activeServerStore.clear();
        }
        await reloadProfiles();
        if (wasActive) {
          await resolveActiveServer();
        }
      })
      .catch(() => {
        return;
      });
  };

  const openTmuxBrowseSession = useCallback(
    (targetProfileId: string) => {
      return Promise.resolve({
        listDirectories: (params: { path: string }) => {
          const entry = registry.find(targetProfileId);
          if (entry === null) {
            return Promise.resolve([]);
          }
          return entry.session.listRemoteDirectories({ path: params.path });
        },
        disconnect: () => {
          return;
        },
      });
    },
    [registry]
  );

  const handleReconnect = () => {
    if (terminalTarget === null) {
      return;
    }
    const { profileId, connectOptions } = terminalTarget;
    // The old entry left the registry when it closed; ensureStarted re-adds it
    // (on a fresh session) and hands back the live entry.
    void registry
      .ensureStarted({ profileId, connectOptions })
      .then((entry) => {
        setTerminalTarget(entry);
      })
      .catch(() => {
        return;
      });
  };

  const handleEdit = () => {
    if (terminalTarget === null) {
      return;
    }
    router.push({ params: { id: terminalTarget.profileId }, pathname: '/connect' });
  };

  const persistAcceptedHostKeyToStore = async (hostKeyLine: string) => {
    if (terminalTarget === null) {
      return;
    }
    const profile = await serverProfileStore.findById({ id: terminalTarget.profileId });
    if (profile === null) {
      return;
    }
    await serverProfileStore.save({
      profile: {
        ...profile,
        acceptedHostKeys: mergeAcceptedHostKey(profile.acceptedHostKeys, hostKeyLine),
      },
    });
  };

  const handleAcceptHostKey = () => {
    const pendingHostKey = sessionState.pendingHostKey;
    if (pendingHostKey === undefined) {
      return;
    }
    void (persistAcceptedHostKey ?? persistAcceptedHostKeyToStore)(pendingHostKey.hostKeyLine);
    activeSession?.acceptHostKey();
  };

  const handleRejectHostKey = () => {
    activeSession?.rejectHostKey();
  };

  if (!hasCheckedProfile) {
    return null;
  }

  if (isSetupNeeded) {
    return (
      <View style={[styles.screen, styles.setupScreen, { paddingTop: safeAreaInsets.top }]} testID="terminal-setup">
        <Text style={styles.statusText}>No instances configured</Text>
        <Text style={styles.setupHint}>Add an instance to start an SSH terminal session.</Text>
        <Pressable
          accessibilityLabel="Add instance"
          accessibilityRole="button"
          onPress={() => {
            router.push('/connect');
          }}
          style={[styles.statusButton, styles.reconnectButton]}
          testID="terminal-setup-add-server"
        >
          <Text style={styles.statusButtonText}>Add instance</Text>
        </Pressable>
      </View>
    );
  }

  const isTerminalActive = sessionState.status === 'connected';
  // The drawer's first level is every saved instance; registry entries without
  // a saved profile (removed elsewhere) keep their row while the connection lives.
  const drawerProfileById = new Map<string, TerminalScreenProfile>(
    savedProfiles.map((profile) => {
      return [profile.id, profile];
    })
  );
  registryEntries.forEach((entry) => {
    if (!drawerProfileById.has(entry.profileId)) {
      drawerProfileById.set(entry.profileId, {
        host: entry.connectOptions.host,
        id: entry.profileId,
        label: toServerDisplayNameOf(entry.connectOptions),
        remotePath: entry.connectOptions.remotePath,
      });
    }
  });
  const drawerServers: ServersDrawerServer[] = [...drawerProfileById.values()].map((profile) => {
    const entry = registryEntries.find((candidate) => {
      return candidate.profileId === profile.id;
    });
    const listing = tmuxListings[profile.id] ?? EMPTY_TMUX_LISTING;
    return {
      profileId: profile.id,
      displayName: profile.label === '' ? profile.host : profile.label,
      status:
        entry === undefined
          ? 'disconnected'
          : toDrawerServerStatus(entry.session.currentState.status),
      sessionNames: listing.sessionNames,
      currentSessionName: listing.currentSessionName,
      defaultPath: profile.remotePath ?? '',
      isLoading: listing.isLoading,
      listError: listing.error,
    };
  });

  return (
    <View style={[styles.screen, keyboardInsetStyle, landscapeInsetStyle]} testID="terminal-screen">
      <View style={[styles.topBar, { paddingTop: safeAreaInsets.top }]}>
        <Pressable
          accessibilityLabel="Instances"
          accessibilityRole="button"
          onPress={handleOpenDrawer}
          style={styles.menuButton}
        >
          <MaterialCommunityIcons color={constant.terminal.fg} name="menu" size={24} />
        </Pressable>
        <View style={[styles.statusDot, { backgroundColor: statusDotColorOf(sessionState.status) }]} />
        <Text numberOfLines={1} style={styles.hostText}>
          {terminalTarget === null
            ? ''
            : topBarTitleOf(
                terminalTarget.connectOptions,
                tmuxListings[terminalTarget.profileId]?.currentSessionName ?? null
              )}
        </Text>
        <Pressable
          accessibilityLabel="Disconnect"
          accessibilityRole="button"
          onPress={handleDisconnect}
          style={styles.disconnectButton}
        >
          <Text style={styles.disconnectText}>X</Text>
        </Pressable>
      </View>
      <View style={[styles.content, isLandscape && styles.contentLandscape]} testID="terminal-content">
        <View style={styles.terminalArea} testID="terminal-area" {...pinchPanHandlers}>
          {isTerminalActive ? (
            <TerminalView
              boldFontFamily={boldFontFamily}
              charWidthPx={charWidthPx}
              onSurfaceLayout={handleViewportLayout}
              followRequestCount={followRequestCount}
              fontFamily={fontFamily}
              fontSize={fontSize}
              isCursorVisible
              isRemoteScrollEnabled={activeSession?.isRemoteScrollEnabled ?? false}
              lineHeight={lineHeight}
              onScrollRows={handleScrollRows}
              onSelectionLongPress={terminalSelection.startAtPosition}
              onSelectionMarkerSwitch={terminalSelection.switchActiveMarker}
              onSelectionMove={terminalSelection.moveActiveMarkerTo}
              selection={terminalSelection.selection}
              selectionMoveMode={
                preference.isSelectionFollowFingerEnabled ? 'follow' : 'relative'
              }
              snapshot={snapshot}
            />
          ) : (
            <TerminalStatusView
              onAcceptHostKey={handleAcceptHostKey}
              onEdit={handleEdit}
              onRejectHostKey={handleRejectHostKey}
              onReconnect={handleReconnect}
              state={sessionState}
            />
          )}
          <Text
            allowFontScaling={false}
            key={`${fontFamily}-${fontSize}`}
            onTextLayout={handleProbeTextLayout}
            style={[styles.probe, { fontFamily, fontSize }]}
            testID="terminal-probe"
          >
            {constant.terminal.gridProbe.text}
          </Text>
        </View>
        <ExtraKeysRow
          armedModifier={armedModifier}
          isSelectionAcceptable={terminalSelection.isAcceptable}
          isApplicationCursorMode={activeSession?.isApplicationCursorKeys ?? false}
          isConnected={isTerminalActive}
          isKeyboardVisible={isKeyboardVisible}
          isLandscape={isLandscape}
          onModifierLongPress={handleModifierLongPress}
          onModifierTap={handleModifierTap}
          onModifierUsed={handleModifierUsed}
          onSelectionAccept={terminalSelection.accept}
          onSelectionMarkerTap={terminalSelection.setActiveMarker}
          onSelectionToggle={handleSelectionToggle}
          onToggleKeyboard={handleToggleKeyboard}
          onWrite={handleWrite}
          selection={terminalSelection.selection}
        />
      </View>
      <HiddenKeyboardInput
        armedModifier={armedModifier}
        inputRef={inputRef}
        onModifierUsed={handleModifierUsed}
        onWrite={handleWrite}
      />
      <ServersDrawer
        currentProfileId={terminalTarget?.profileId ?? null}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onAddServer={handleAddServer}
        onCloneSession={handleDrawerCloneSession}
        onCreateSession={handleDrawerCreateSession}
        onDeleteSession={handleDrawerDeleteSession}
        onDisconnectServer={handleDrawerDisconnectServer}
        onEditServer={handleDrawerEditServer}
        onOpenSettings={handleOpenSettings}
        onRefreshServer={refreshTmuxListing}
        onRemoveServer={handleDrawerRemoveServer}
        onRenameSession={handleDrawerRenameSession}
        onSelectServer={handleDrawerSelectServer}
        onSelectSession={handleDrawerSelectSession}
        openBrowseSession={openTmuxBrowseSession}
        servers={drawerServers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: constant.terminal.bg,
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: '#111111',
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  menuButton: {
    paddingVertical: 6,
  },
  statusDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  hostText: {
    color: constant.terminal.fg,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  disconnectButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  disconnectText: {
    color: constant.terminal.fg,
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentLandscape: {
    flexDirection: 'row',
  },
  terminalArea: {
    flex: 1,
  },
  probe: {
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0,
  },
  statusContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  setupScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  setupHint: {
    color: '#9e9e9e',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  statusText: {
    color: constant.terminal.fg,
    fontSize: 15,
    textAlign: 'center',
  },
  statusDetail: {
    color: '#9e9e9e',
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  statusActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  statusButton: {
    borderColor: constant.terminal.fg,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  reconnectButton: {
    borderWidth: 2,
  },
  statusButtonText: {
    color: constant.terminal.fg,
    fontSize: 14,
  },
});
