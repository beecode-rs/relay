import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { constant } from '@/constants/constant';
import { FolderBrowserModal } from '@/components/folder-browser-modal';
import type { RemoteBrowseSession } from '@/services/terminal/remote-browse';
import { tmuxAttachUtil } from '@/services/terminal/tmux-attach';

const DRAWER_WIDTH = 288;
const BACKDROP_COLOR = 'rgba(0,0,0,0.5)';
const SLIDE_DURATION_MS = 200;
const DRAWER_BG = '#111111';
const ERROR_COLOR = '#ff8a80';
const MUTED_COLOR = '#9e9e9e';
const CURRENT_SESSION_COLOR = '#00cd00';
const CURRENT_SESSION_BG = '#1a241a';

const INVALID_SESSION_NAME_CHARS_PATTERN = /[.:]/;

const toSessionNameOf = (trimmedName: string, defaultSessionName: string): string => {
  if (trimmedName === '') {
    return defaultSessionName;
  }

  return trimmedName;
};

const toRenameErrorOf = (params: {
  nextSessionName: string;
  renameTargetName: string;
  sessionNames: string[];
}): string | null => {
  if (params.nextSessionName === '') {
    return 'Enter a session name';
  }
  if (INVALID_SESSION_NAME_CHARS_PATTERN.test(params.nextSessionName)) {
    return "Session names cannot contain '.' or ':'";
  }
  if (
    params.nextSessionName !== params.renameTargetName &&
    params.sessionNames.includes(params.nextSessionName)
  ) {
    return `A session named "${params.nextSessionName}" already exists`;
  }

  return null;
};

const toRemotePathOf = (trimmedPath: string, defaultPath: string): string => {
  if (trimmedPath === '') {
    return defaultPath;
  }

  return trimmedPath;
};

export type TmuxSessionsDrawerProps = {
  isOpen: boolean;
  isLoading: boolean;
  listError?: string | null;
  sessionNames: string[];
  currentSessionName?: string | null;
  defaultPath: string;
  openBrowseSession?: () => Promise<RemoteBrowseSession>;
  onClose(): void;
  onCreate(sessionName: string, remotePath: string): void;
  onOpenSettings(): void;
  onDelete(sessionName: string): void;
  onDetach(): void;
  onRename(sessionName: string, nextSessionName: string): void;
  onSelect(sessionName: string): void;
};

export function TmuxSessionsDrawer({
  isOpen,
  isLoading,
  listError,
  sessionNames,
  currentSessionName,
  defaultPath,
  openBrowseSession,
  onClose,
  onCreate,
  onOpenSettings,
  onDelete,
  onDetach,
  onRename,
  onSelect,
}: TmuxSessionsDrawerProps) {
  const [translateX] = useState(() => {
    return new Animated.Value(-DRAWER_WIDTH);
  });
  const [isNamePromptVisible, setIsNamePromptVisible] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [isRenamePromptVisible, setIsRenamePromptVisible] = useState(false);
  const [renameTargetName, setRenameTargetName] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isBrowserVisible, setIsBrowserVisible] = useState(false);
  const safeAreaInsets = useSafeAreaInsets();

  useEffect(() => {
    if (!isOpen) {
      translateX.setValue(-DRAWER_WIDTH);
      return;
    }
    Animated.timing(translateX, {
      duration: SLIDE_DURATION_MS,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [isOpen, translateX]);

  const defaultSessionName = tmuxAttachUtil.toNextSessionName({ sessionNames });
  const hasListError = listError !== null && listError !== undefined;

  const toBrowseInitialPath = () => {
    const enteredPath = pathInput.trim();
    if (enteredPath !== '') {
      return enteredPath;
    }
    if (defaultPath !== '') {
      return defaultPath;
    }

    return '/';
  };

  const handleOpenNamePrompt = () => {
    setSessionNameInput('');
    setPathInput('');
    setIsNamePromptVisible(true);
  };

  const handleCancelNamePrompt = () => {
    setIsNamePromptVisible(false);
  };

  const handleCreateSession = () => {
    const trimmedName = sessionNameInput.trim();
    const sessionName = toSessionNameOf(trimmedName, defaultSessionName);
    const trimmedPath = pathInput.trim();
    const remotePath = toRemotePathOf(trimmedPath, defaultPath);
    onCreate(sessionName, remotePath);
    setIsNamePromptVisible(false);
  };

  const handleBrowsePress = () => {
    setIsBrowserVisible(true);
  };

  const handleDeleteSessionPress = (sessionName: string) => {
    Alert.alert(
      'Close session',
      `Close tmux session "${sessionName}"? Any processes running in it will be terminated.`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            onDelete(sessionName);
          },
          style: 'destructive',
          text: 'Close',
        },
      ]
    );
  };

  const handleOpenRenamePrompt = (sessionName: string) => {
    setRenameTargetName(sessionName);
    setRenameInput(sessionName);
    setRenameError(null);
    setIsRenamePromptVisible(true);
  };

  const handleCancelRenamePrompt = () => {
    setIsRenamePromptVisible(false);
  };

  const handleRenameInputChange = (value: string) => {
    setRenameInput(value);
    setRenameError(null);
  };

  const handleRenameSession = () => {
    const targetName = renameTargetName;
    if (targetName === null) {
      return;
    }
    const nextSessionName = renameInput.trim();
    const nextRenameError = toRenameErrorOf({
      nextSessionName,
      renameTargetName: targetName,
      sessionNames,
    });
    if (nextRenameError !== null) {
      setRenameError(nextRenameError);
      return;
    }
    onRename(targetName, nextSessionName);
    setIsRenamePromptVisible(false);
  };

  const handleBrowseCancel = () => {
    setIsBrowserVisible(false);
  };

  const handleBrowseSelect = (path: string) => {
    setPathInput(path);
    setIsBrowserVisible(false);
  };

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible={isOpen}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.drawer,
            {
              paddingBottom: safeAreaInsets.bottom,
              paddingTop: safeAreaInsets.top,
              transform: [{ translateX }],
            },
          ]}
          testID="tmux-sessions-drawer"
        >
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Sessions</Text>
            <View style={styles.drawerHeaderActions}>
              <Pressable
                accessibilityLabel="New session"
                accessibilityRole="button"
                onPress={handleOpenNamePrompt}
              >
                <MaterialCommunityIcons color={constant.terminal.fg} name="plus" size={22} />
              </Pressable>
              <Pressable accessibilityLabel="Close sessions drawer" accessibilityRole="button" onPress={onClose}>
                <MaterialCommunityIcons color={constant.terminal.fg} name="close" size={22} />
              </Pressable>
            </View>
          </View>
          <ScrollView style={styles.sessionList}>
            <Pressable
              accessibilityLabel="Detach from session"
              accessibilityRole="button"
              onPress={onDetach}
              style={({ pressed }) => {
                return [styles.sessionRow, pressed ? styles.sessionRowPressed : null];
              }}
              testID="tmux-detach-row"
            >
              <MaterialCommunityIcons color={MUTED_COLOR} name="logout" size={18} />
              <Text numberOfLines={1} style={styles.sessionName}>
                Detach from session
              </Text>
            </Pressable>
            {!isLoading && hasListError ? <Text style={styles.errorText}>{listError}</Text> : null}
            {!isLoading && !hasListError && sessionNames.length === 0 ? (
              <Text style={styles.hintText}>No tmux sessions</Text>
            ) : null}
            {sessionNames.map((sessionName) => {
              const isCurrentSession = sessionName === currentSessionName;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrentSession }}
                  key={sessionName}
                  onPress={() => {
                    onSelect(sessionName);
                  }}
                  style={({ pressed }) => {
                    return [
                      styles.sessionRow,
                      isCurrentSession ? styles.sessionRowCurrent : null,
                      pressed ? styles.sessionRowPressed : null,
                    ];
                  }}
                  testID={`tmux-session-row-${sessionName}`}
                >
                  <MaterialCommunityIcons
                    color={isCurrentSession ? CURRENT_SESSION_COLOR : MUTED_COLOR}
                    name="console"
                    size={18}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.sessionName, isCurrentSession ? styles.sessionNameCurrent : null]}
                  >
                    {sessionName}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Rename session ${sessionName}`}
                    accessibilityRole="button"
                    onPress={() => {
                      handleOpenRenamePrompt(sessionName);
                    }}
                    style={styles.sessionActionButton}
                  >
                    <MaterialCommunityIcons color={MUTED_COLOR} name="pencil-outline" size={18} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Close session ${sessionName}`}
                    accessibilityRole="button"
                    onPress={() => {
                      handleDeleteSessionPress(sessionName);
                    }}
                    style={styles.sessionActionButton}
                  >
                    <MaterialCommunityIcons color={MUTED_COLOR} name="trash-can-outline" size={18} />
                  </Pressable>
                </Pressable>
              );
            })}
            {isLoading ? <Text style={styles.hintText}>Loading…</Text> : null}
          </ScrollView>
          <View style={styles.drawerFooter}>
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={onOpenSettings}
              style={({ pressed }) => {
                return [styles.sessionRow, pressed ? styles.sessionRowPressed : null];
              }}
              testID="tmux-settings-row"
            >
              <MaterialCommunityIcons color={MUTED_COLOR} name="cog-outline" size={18} />
              <Text numberOfLines={1} style={styles.sessionName}>
                Settings
              </Text>
            </Pressable>
          </View>
        </Animated.View>
        <Pressable accessibilityLabel="Close sessions drawer" onPress={onClose} style={styles.backdropPressable} />
        {isNamePromptVisible ? (
          <View style={styles.promptOverlay}>
            <Pressable
              accessibilityLabel="Cancel new session"
              onPress={handleCancelNamePrompt}
              style={styles.promptBackdropPressable}
            />
            <View style={styles.promptCard}>
              <Text style={styles.promptTitle}>New session</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onChangeText={setSessionNameInput}
                onSubmitEditing={handleCreateSession}
                placeholder={defaultSessionName}
                placeholderTextColor={MUTED_COLOR}
                style={styles.promptInput}
                testID="tmux-new-session-name-input"
                value={sessionNameInput}
              />
              <Text style={styles.promptPathLabel}>Path</Text>
              <View style={styles.promptPathRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setPathInput}
                  placeholder={defaultPath === '' ? '/' : defaultPath}
                  placeholderTextColor={MUTED_COLOR}
                  style={[styles.promptInput, styles.promptPathInput]}
                  testID="tmux-new-session-path-input"
                  value={pathInput}
                />
                {openBrowseSession !== undefined ? (
                  <Pressable
                    accessibilityLabel="Browse remote folders"
                    accessibilityRole="button"
                    onPress={handleBrowsePress}
                    style={styles.promptBrowseButton}
                  >
                    <MaterialCommunityIcons color={constant.terminal.fg} name="folder-outline" size={22} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.promptActions}>
                <Pressable accessibilityRole="button" onPress={handleCancelNamePrompt} style={styles.promptButton}>
                  <Text style={styles.promptButtonTextMuted}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={handleCreateSession} style={styles.promptButton}>
                  <Text style={styles.promptButtonText}>Create</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
        {isRenamePromptVisible ? (
          <View style={styles.promptOverlay}>
            <Pressable
              accessibilityLabel="Cancel rename"
              onPress={handleCancelRenamePrompt}
              style={styles.promptBackdropPressable}
            />
            <View style={styles.promptCard}>
              <Text style={styles.promptTitle}>Rename session</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onChangeText={handleRenameInputChange}
                onSubmitEditing={handleRenameSession}
                placeholderTextColor={MUTED_COLOR}
                style={styles.promptInput}
                testID="tmux-rename-session-input"
                value={renameInput}
              />
              {renameError !== null ? <Text style={styles.promptErrorText}>{renameError}</Text> : null}
              <View style={styles.promptActions}>
                <Pressable accessibilityRole="button" onPress={handleCancelRenamePrompt} style={styles.promptButton}>
                  <Text style={styles.promptButtonTextMuted}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={handleRenameSession} style={styles.promptButton}>
                  <Text style={styles.promptButtonText}>Rename</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
        {openBrowseSession !== undefined ? (
          <FolderBrowserModal
            initialPath={toBrowseInitialPath()}
            isVisible={isBrowserVisible}
            openSession={openBrowseSession}
            onCancel={handleBrowseCancel}
            onSelect={handleBrowseSelect}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: BACKDROP_COLOR,
    flex: 1,
    flexDirection: 'row',
  },
  backdropPressable: {
    flex: 1,
  },
  drawer: {
    backgroundColor: DRAWER_BG,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    maxWidth: '85%',
    width: DRAWER_WIDTH,
  },
  drawerFooter: {
    borderTopColor: '#222222',
    borderTopWidth: 1,
  },
  drawerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  drawerHeaderActions: {
    flexDirection: 'row',
    gap: 20,
  },
  errorText: {
    color: ERROR_COLOR,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 16,
  },
  drawerTitle: {
    color: constant.terminal.fg,
    fontSize: 15,
    fontWeight: '700',
  },
  hintText: {
    color: MUTED_COLOR,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 16,
  },
  promptErrorText: {
    color: ERROR_COLOR,
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 8,
  },
  promptActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  promptBackdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  promptButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promptButtonText: {
    color: constant.terminal.fg,
    fontSize: 14,
    fontWeight: '700',
  },
  promptButtonTextMuted: {
    color: MUTED_COLOR,
    fontSize: 14,
  },
  promptCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 8,
    maxWidth: 320,
    padding: 16,
    width: '85%',
  },
  promptInput: {
    backgroundColor: '#000000',
    borderRadius: 6,
    color: constant.terminal.fg,
    fontFamily: 'monospace',
    fontSize: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  promptPathInput: {
    flex: 1,
    marginTop: 0,
  },
  promptPathLabel: {
    color: MUTED_COLOR,
    fontSize: 12,
    marginTop: 12,
  },
  promptPathRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  promptBrowseButton: {
    paddingVertical: 6,
  },
  promptOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: BACKDROP_COLOR,
    justifyContent: 'center',
  },
  promptTitle: {
    color: constant.terminal.fg,
    fontSize: 15,
    fontWeight: '700',
  },
  sessionName: {
    color: constant.terminal.fg,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
    marginLeft: 8,
  },
  sessionNameCurrent: {
    fontWeight: '700',
  },
  sessionRow: {
    alignItems: 'center',
    borderLeftColor: 'transparent',
    borderLeftWidth: 2,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sessionRowCurrent: {
    backgroundColor: CURRENT_SESSION_BG,
    borderLeftColor: CURRENT_SESSION_COLOR,
  },
  sessionRowPressed: {
    backgroundColor: '#222222',
  },
  sessionActionButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sessionList: {
    flex: 1,
  },
});
