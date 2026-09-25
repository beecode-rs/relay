import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
  useFonts,
} from '@expo-google-fonts/jetbrains-mono';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
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
import { TmuxSessionsDrawer } from '@/features/terminal/tmux-sessions-drawer';
import { TerminalView } from '@/features/terminal/terminal-view';
import { usePinchFontSize } from '@/features/terminal/use-pinch-font-size';
import { useTerminalSelection } from '@/features/terminal/use-terminal-selection';
import { serverConnectOptions } from '@/services/connection/connect-options';
import { serverLastSessionStore } from '@/services/connection/server-last-session-store';
import type { ServerLastSessionStore } from '@/services/connection/server-last-session-store';
import { mergeAcceptedHostKey } from '@/services/connection/server-profile';
import { serverProfileStore } from '@/services/connection/server-profile-store';
import { terminalSession } from '@/services/terminal/terminal-session';
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
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

export type TerminalScreenSession = Pick<
  TerminalSession,
  | 'acceptHostKey'
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

export type ConnectOptionsLoader = (params: { id: string }) => Promise<SshConnectOptions | null>;

export type TerminalScreenProps = {
  session?: TerminalScreenSession;
  profileId?: string;
  loadConnectOptions?: ConnectOptionsLoader;
  persistAcceptedHostKey?: (hostKeyLine: string) => Promise<void>;
  lastSessionStore?: ServerLastSessionStore;
};

type TerminalAreaSize = { heightPx: number; widthPx: number };
type ProbeMetrics = { lineHeightPx: number; widthPx: number };

const OUTPUT_TICK_MS = 32;
const KEYBOARD_REFOCUS_DELAY_MS = 100;

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

const defaultLoadConnectOptions: ConnectOptionsLoader = (params) => {
  return serverConnectOptions.build(params);
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
  session = terminalSession,
  profileId,
  loadConnectOptions = defaultLoadConnectOptions,
  persistAcceptedHostKey,
  lastSessionStore = serverLastSessionStore,
}: TerminalScreenProps) {
  const [isFontsLoaded] = useFonts({ JetBrainsMono_400Regular, JetBrainsMono_700Bold });
  const [connectOptions, setConnectOptions] = useState<SshConnectOptions | null>(null);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [sessionState, setSessionState] = useState<TerminalSessionState>(() => {
    return session.currentState;
  });
  const [snapshot, setSnapshot] = useState<TerminalSnapshot>(() => {
    return session.snapshot();
  });
  const [armedModifier, setArmedModifier] = useState<TerminalModifierName | null>(null);
  const [isModifierLocked, setIsModifierLocked] = useState(false);
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [isTmuxListLoading, setIsTmuxListLoading] = useState(false);
  const [tmuxListError, setTmuxListError] = useState<string | null>(null);
  const [tmuxSessionNames, setTmuxSessionNames] = useState<string[]>([]);
  const [currentTmuxSessionName, setCurrentTmuxSessionName] = useState<string | null>(null);
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

  useEffect(() => {
    const loadAndStart = async () => {
      if (profileId === undefined) {
        router.dismissTo('/');
        return;
      }
      const options = await loadConnectOptions({ id: profileId });
      if (options === null) {
        router.dismissTo('/');
        return;
      }
      setConnectOptions(options);
      setHasCheckedProfile(true);
      if (session.status === 'idle' || !session.isActiveFor(options)) {
        await session.start(options);
      }
    };
    void loadAndStart();
  }, [session, profileId, loadConnectOptions]);

  useEffect(() => {
    return session.subscribe((state) => {
      setSessionState(state);
      setSnapshot(session.snapshot());
      if (state.status === 'closed') {
        router.dismissTo('/');
      }
    });
  }, [session]);

  useEffect(() => {
    const pullOutput = () => {
      const output = session.drainPendingOutput();
      if (output === null) {
        return;
      }
      setSnapshot(session.snapshot());
      setTimeout(() => {
        setSnapshot(session.snapshot());
      }, 0);
    };
    const timer = setInterval(pullOutput, OUTPUT_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [session]);

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
    if (probeMetrics === null || availableSize === null) {
      return;
    }
    const grid = charMetrics.gridSizeFromProbe({
      availableHeightPx: availableSize.heightPx,
      availableWidthPx: availableSize.widthPx,
      probeCharCount: constant.terminal.gridProbe.charCount,
      probeLineHeightPx: probeMetrics.lineHeightPx,
      probeWidthPx: probeMetrics.widthPx,
    });
    session.resize({ cols: grid.cols, rows: grid.rows });
  }, [availableSize, probeMetrics, session]);

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

  const handleWrite = useCallback(
    (sequence: string) => {
      setFollowRequestCount((count) => {
        return count + 1;
      });
      session.write(sequence);
    },
    [session]
  );

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

  const handleScrollRows = useCallback(
    (params: { rows: number }) => {
      session.scrollRows({ rows: params.rows });
    },
    [session]
  );

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
      session.dismissTmuxPrompt();
    };
    const installCommand = tmuxPrompt.installCommand;
    if (installCommand === null) {
      Alert.alert(
        'tmux is not installed',
        'tmux keeps terminal sessions alive on the server. Install it with this system package manager, then reconnect.',
        [{ onPress: dismiss, text: 'OK' }]
      );
      return;
    }
    Alert.alert(
      'tmux is not installed',
      `tmux keeps terminal sessions alive on the server.\n\nInstall it now? This runs in the terminal and may ask for your password:\n${installCommand}`,
      [
        { onPress: dismiss, style: 'cancel', text: 'Not now' },
        {
          onPress: () => {
            handleWrite(`${installCommand}\r`);
            dismiss();
          },
          text: 'Install',
        },
      ]
    );
  }, [handleWrite, session, sessionState.tmuxPrompt]);

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect',
      `Close the connection to ${connectOptions?.host ?? 'this server'}?`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            session.end();
            router.dismissTo('/');
          },
          style: 'destructive',
          text: 'Disconnect',
        },
      ]
    );
  };

  const rememberLastTmuxSession = useCallback(
    (sessionName: string | null) => {
      if (profileId === undefined) {
        return;
      }
      if (sessionName === null) {
        void lastSessionStore.clear({ id: profileId });
        return;
      }
      void lastSessionStore.save({ id: profileId, sessionName });
    },
    [lastSessionStore, profileId]
  );

  const applyTmuxListResult = useCallback(
    (result: TmuxSessionListResult) => {
      if (result.kind === 'error') {
        setTmuxSessionNames([]);
        setTmuxListError(result.message);
        setCurrentTmuxSessionName(null);

        return;
      }
      setTmuxSessionNames(result.sessionNames);
      setTmuxListError(null);
      setCurrentTmuxSessionName(result.currentSessionName);
      if (result.sessionNames.length > 0) {
        rememberLastTmuxSession(result.currentSessionName);
      }
    },
    [rememberLastTmuxSession]
  );

  const refreshTmuxSessions = useCallback(
    () => {
      setIsTmuxListLoading(true);
      void session
        .listTmuxSessions()
        .then(applyTmuxListResult)
        .finally(() => {
          setIsTmuxListLoading(false);
        });
    },
    [applyTmuxListResult, session]
  );

  // tmux auto-attaches in the shell right after connect; refresh the listing
  // once so the top bar shows the attached session name without opening the drawer.
  useEffect(() => {
    if (sessionState.status !== 'connected') {
      return;
    }
    void session.listTmuxSessions().then(applyTmuxListResult);
  }, [applyTmuxListResult, session, sessionState.status]);

  const handleOpenSessionsDrawer = () => {
    setIsSessionsDrawerOpen(true);
    refreshTmuxSessions();
  };

  const handleCloseSessionsDrawer = () => {
    setIsSessionsDrawerOpen(false);
  };

  const handleOpenSettings = () => {
    setIsSessionsDrawerOpen(false);
    router.navigate('/settings');
  };

  const handleSelectTmuxSession = (sessionName: string) => {
    setIsSessionsDrawerOpen(false);
    void session.focusTmuxSession({ sessionName }).then((wasFocused) => {
      if (wasFocused) {
        setCurrentTmuxSessionName(sessionName);
        rememberLastTmuxSession(sessionName);
      }
    });
  };

  const handleDeleteTmuxSession = (sessionName: string) => {
    void session.killTmuxSession({ sessionName }).then((wasKilled) => {
      if (wasKilled) {
        refreshTmuxSessions();
      }
    });
  };

  const handleDetachTmux = () => {
    setIsSessionsDrawerOpen(false);
    void session.detachTmuxSession().then((wasDetached) => {
      if (wasDetached) {
        setCurrentTmuxSessionName(null);
        rememberLastTmuxSession(null);
      }
    });
  };

  const handleRenameTmuxSession = (sessionName: string, nextSessionName: string) => {
    void session.renameTmuxSession({ nextSessionName, sessionName }).then((wasRenamed) => {
      if (wasRenamed) {
        refreshTmuxSessions();
      }
    });
  };

  const handleCreateTmuxSession = (sessionName: string, remotePath: string) => {
    setIsSessionsDrawerOpen(false);
    void session
      .createTmuxSession({ sessionName, startPath: remotePath })
      .then((wasCreated) => {
        if (!wasCreated) {
          return false;
        }
        return session.focusTmuxSession({ sessionName });
      })
      .then((wasFocused) => {
        if (wasFocused) {
          setCurrentTmuxSessionName(sessionName);
          rememberLastTmuxSession(sessionName);
        }
      });
  };

  const openTmuxBrowseSession = useCallback(() => {
    return Promise.resolve({
      listDirectories: (params: { path: string }) => {
        return session.listRemoteDirectories({ path: params.path });
      },
      disconnect: () => {
        return;
      },
    });
  }, [session]);

  const handleReconnect = () => {
    if (connectOptions === null) {
      return;
    }
    void session.start(connectOptions);
  };

  const handleEdit = () => {
    router.replace({ params: { id: profileId }, pathname: '/connect' });
  };

  const persistAcceptedHostKeyToStore = async (hostKeyLine: string) => {
    if (profileId === undefined) {
      return;
    }
    const profile = await serverProfileStore.findById({ id: profileId });
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
    session.acceptHostKey();
  };

  const handleRejectHostKey = () => {
    session.rejectHostKey();
  };

  if (!hasCheckedProfile || connectOptions === null) {
    return null;
  }

  const isTerminalActive = sessionState.status === 'connected';

  return (
    <View style={[styles.screen, keyboardInsetStyle, landscapeInsetStyle]} testID="terminal-screen">
      <View style={[styles.topBar, { paddingTop: safeAreaInsets.top }]}>
        <Pressable
          accessibilityLabel="Sessions"
          accessibilityRole="button"
          onPress={handleOpenSessionsDrawer}
          style={styles.menuButton}
        >
          <MaterialCommunityIcons color={constant.terminal.fg} name="menu" size={24} />
        </Pressable>
        <View style={[styles.statusDot, { backgroundColor: statusDotColorOf(sessionState.status) }]} />
        <Text numberOfLines={1} style={styles.hostText}>
          {topBarTitleOf(connectOptions, currentTmuxSessionName)}
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
              isRemoteScrollEnabled={session.isRemoteScrollEnabled}
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
          isApplicationCursorMode={session.isApplicationCursorKeys}
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
      <TmuxSessionsDrawer
        currentSessionName={currentTmuxSessionName}
        defaultPath={connectOptions?.remotePath ?? ''}
        isLoading={isTmuxListLoading}
        isOpen={isSessionsDrawerOpen}
        listError={tmuxListError}
        onClose={handleCloseSessionsDrawer}
        onCreate={handleCreateTmuxSession}
        onOpenSettings={handleOpenSettings}
        onDelete={handleDeleteTmuxSession}
        onDetach={handleDetachTmux}
        onRename={handleRenameTmuxSession}
        onSelect={handleSelectTmuxSession}
        openBrowseSession={openTmuxBrowseSession}
        sessionNames={tmuxSessionNames}
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
