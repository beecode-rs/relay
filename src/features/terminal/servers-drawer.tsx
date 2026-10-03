import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { constant } from '@/constants/constant';
import { FolderBrowserModal } from '@/components/folder-browser-modal';
import { appInfo } from '@/constants/app';
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
const CURRENT_SERVER_BG = '#191919';
const ROW_PRESSED_BG = '#222222';
const STATUS_CONNECTED = '#4caf50';
const STATUS_CONNECTING = '#ffc107';
const STATUS_DISCONNECTED = '#9e9e9e';
const STATUS_FAILED = '#f44336';

const INVALID_SESSION_NAME_CHARS_PATTERN = /[.:]/;

export type ServersDrawerServerStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'host-key-unknown'
  | 'host-key-changed'
  | 'error';

export type ServersDrawerServer = {
  profileId: string;
  displayName: string;
  status: ServersDrawerServerStatus;
  sessionNames: string[];
  currentSessionName: string | null;
  defaultPath: string;
  isLoading: boolean;
  listError: string | null;
};

export type ServersDrawerProps = {
  isOpen: boolean;
  servers: ServersDrawerServer[];
  currentProfileId?: string | null;
  openBrowseSession?(profileId: string): Promise<RemoteBrowseSession>;
  onClose(): void;
  onAddServer(): void;
  onOpenSettings(): void;
  onSelectServer(profileId: string): void;
  onSelectSession(profileId: string, sessionName: string): void;
  onCreateSession(profileId: string, sessionName: string, remotePath: string): void;
  onRenameSession(profileId: string, sessionName: string, nextSessionName: string): void;
  onCloneSession(profileId: string, sessionName: string): void;
  onDeleteSession(profileId: string, sessionName: string): void;
  onDisconnectServer(profileId: string): void;
  onRefreshServer(profileId: string): void;
  onEditServer(profileId: string): void;
  onRemoveServer(profileId: string): void;
};

const statusColorOf = (status: ServersDrawerServerStatus): string => {
  if (status === 'connected') {
    return STATUS_CONNECTED;
  }
  if (status === 'connecting') {
    return STATUS_CONNECTING;
  }
  if (status === 'disconnected') {
    return STATUS_DISCONNECTED;
  }
  return STATUS_FAILED;
};

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

export function ServersDrawer({
  isOpen,
  servers,
  currentProfileId,
  openBrowseSession,
  onClose,
  onAddServer,
  onOpenSettings,
  onSelectServer,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onCloneSession,
  onDeleteSession,
  onDisconnectServer,
  onRefreshServer,
  onEditServer,
  onRemoveServer,
}: ServersDrawerProps) {
  const [translateX] = useState(() => {
    return new Animated.Value(-DRAWER_WIDTH);
  });
  const [collapsedProfileIds, setCollapsedProfileIds] = useState<string[]>([]);
  const [menuTarget, setMenuTarget] = useState<
    { kind: 'server'; profileId: string } | { kind: 'session'; profileId: string; sessionName: string } | null
  >(null);
  const [createTargetId, setCreateTargetId] = useState<string | null>(null);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ profileId: string; sessionName: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isBrowserVisible, setIsBrowserVisible] = useState(false);
  const safeAreaInsets = useSafeAreaInsets();

  const handleClose = () => {
    setMenuTarget(null);
    setCreateTargetId(null);
    setRenameTarget(null);
    onClose();
  };

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

  const createTarget = servers.find((server) => {
    return server.profileId === createTargetId;
  }) ?? null;

  const handleToggleCollapse = (profileId: string) => {
    setCollapsedProfileIds((previous) => {
      return previous.includes(profileId)
        ? previous.filter((candidate) => {
            return candidate !== profileId;
          })
        : [...previous, profileId];
    });
  };

  const handleOpenNamePrompt = (profileId: string) => {
    setMenuTarget(null);
    setCreateTargetId(profileId);
    setSessionNameInput('');
    setPathInput('');
  };

  const handleCancelNamePrompt = () => {
    setCreateTargetId(null);
  };

  const handleCreateSession = () => {
    if (createTarget === null) {
      return;
    }
    const defaultSessionName = tmuxAttachUtil.toNextSessionName({ sessionNames: createTarget.sessionNames });
    const sessionName = toSessionNameOf(sessionNameInput.trim(), defaultSessionName);
    const remotePath = toRemotePathOf(pathInput.trim(), createTarget.defaultPath);
    onCreateSession(createTarget.profileId, sessionName, remotePath);
    setCreateTargetId(null);
  };

  const handleRefreshServer = (profileId: string) => {
    setMenuTarget(null);
    onRefreshServer(profileId);
  };

  const handleDisconnectPress = (server: ServersDrawerServer) => {
    setMenuTarget(null);
    Alert.alert(
      'Disconnect',
      `Disconnect from ${server.displayName}? tmux sessions stay alive on the instance.`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            onDisconnectServer(server.profileId);
          },
          style: 'destructive',
          text: 'Disconnect',
        },
      ]
    );
  };

  const handleEditServer = (profileId: string) => {
    setMenuTarget(null);
    onEditServer(profileId);
  };

  const handleRemovePress = (server: ServersDrawerServer) => {
    setMenuTarget(null);
    Alert.alert(
      'Remove instance',
      `Remove "${server.displayName}" and its stored credentials?`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            onRemoveServer(server.profileId);
          },
          style: 'destructive',
          text: 'Remove',
        },
      ]
    );
  };

  const handleDeleteSessionPress = (profileId: string, sessionName: string) => {
    setMenuTarget(null);
    Alert.alert(
      'Kill session',
      `Kill tmux session "${sessionName}"? Any processes running in it will be terminated.`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            onDeleteSession(profileId, sessionName);
          },
          style: 'destructive',
          text: 'Kill',
        },
      ]
    );
  };

  const handleCloneSession = (profileId: string, sessionName: string) => {
    setMenuTarget(null);
    onCloneSession(profileId, sessionName);
  };

  const handleOpenRenamePrompt = (profileId: string, sessionName: string) => {
    setMenuTarget(null);
    setRenameTarget({ profileId, sessionName });
    setRenameInput(sessionName);
    setRenameError(null);
  };

  const handleCancelRenamePrompt = () => {
    setRenameTarget(null);
  };

  const handleRenameInputChange = (value: string) => {
    setRenameInput(value);
    setRenameError(null);
  };

  const handleRenameSession = () => {
    if (renameTarget === null) {
      return;
    }
    const targetServer = servers.find((server) => {
      return server.profileId === renameTarget.profileId;
    });
    const nextSessionName = renameInput.trim();
    const nextRenameError = toRenameErrorOf({
      nextSessionName,
      renameTargetName: renameTarget.sessionName,
      sessionNames: targetServer?.sessionNames ?? [],
    });
    if (nextRenameError !== null) {
      setRenameError(nextRenameError);
      return;
    }
    onRenameSession(renameTarget.profileId, renameTarget.sessionName, nextSessionName);
    setRenameTarget(null);
  };

  const handleBrowseCancel = () => {
    setIsBrowserVisible(false);
  };

  const handleBrowseSelect = (path: string) => {
    setPathInput(path);
    setIsBrowserVisible(false);
  };

  const toBrowseInitialPath = () => {
    const enteredPath = pathInput.trim();
    if (enteredPath !== '') {
      return enteredPath;
    }
    if (createTarget !== null && createTarget.defaultPath !== '') {
      return createTarget.defaultPath;
    }

    return '/';
  };

  const renderMenuItem = (params: {
    accessibilityLabel: string;
    color?: string;
    iconName: ComponentProps<typeof MaterialCommunityIcons>['name'];
    isDanger?: boolean;
    onPress(): void;
    testID: string;
    title: string;
  }) => {
    return (
      <Pressable
        accessibilityLabel={params.accessibilityLabel}
        accessibilityRole="button"
        onPress={params.onPress}
        style={({ pressed }) => {
          return [styles.menuItem, pressed ? styles.menuItemPressed : null];
        }}
        testID={params.testID}
      >
        <MaterialCommunityIcons color={params.color ?? constant.terminal.fg} name={params.iconName} size={18} />
        <Text style={[styles.menuItemText, params.isDanger === true ? styles.menuItemTextDanger : null]}>
          {params.title}
        </Text>
      </Pressable>
    );
  };

  const renderServerMenu = (server: ServersDrawerServer) => {
    // Session actions need a live connection; the saved-instance actions are
    // always available.
    const isConnected = server.status === 'connected';
    const isDisconnectable = server.status !== 'disconnected';

    return (
      <View style={styles.menuOverlay} testID="servers-drawer-menu">
        <Pressable
          accessibilityLabel="Close instance actions"
          onPress={() => {
            setMenuTarget(null);
          }}
          style={styles.menuBackdropPressable}
        />
        <View style={styles.menuCard}>
          {isConnected
            ? renderMenuItem({
                accessibilityLabel: `New session on ${server.displayName}`,
                iconName: 'plus',
                onPress: () => {
                  handleOpenNamePrompt(server.profileId);
                },
                testID: `servers-drawer-new-session-${server.profileId}`,
                title: 'New session',
              })
            : null}
          {isConnected
            ? renderMenuItem({
                accessibilityLabel: `Refresh sessions on ${server.displayName}`,
                iconName: 'refresh',
                onPress: () => {
                  handleRefreshServer(server.profileId);
                },
                testID: `servers-drawer-refresh-${server.profileId}`,
                title: 'Refresh sessions',
              })
            : null}
          {isDisconnectable
            ? renderMenuItem({
                accessibilityLabel: `Disconnect from ${server.displayName}`,
                color: ERROR_COLOR,
                iconName: 'link-off',
                isDanger: true,
                onPress: () => {
                  handleDisconnectPress(server);
                },
                testID: `servers-drawer-disconnect-${server.profileId}`,
                title: 'Disconnect',
              })
            : null}
          {renderMenuItem({
            accessibilityLabel: `Edit instance ${server.displayName}`,
            iconName: 'pencil-outline',
            onPress: () => {
              handleEditServer(server.profileId);
            },
            testID: `servers-drawer-edit-${server.profileId}`,
            title: 'Edit instance',
          })}
          {renderMenuItem({
            accessibilityLabel: `Remove instance ${server.displayName}`,
            color: ERROR_COLOR,
            iconName: 'trash-can-outline',
            isDanger: true,
            onPress: () => {
              handleRemovePress(server);
            },
            testID: `servers-drawer-remove-${server.profileId}`,
            title: 'Remove instance',
          })}
        </View>
      </View>
    );
  };

  const renderSessionMenu = (profileId: string, sessionName: string) => {
    return (
      <View style={styles.menuOverlay} testID="servers-drawer-session-menu">
        <Pressable
          accessibilityLabel="Close session actions"
          onPress={() => {
            setMenuTarget(null);
          }}
          style={styles.menuBackdropPressable}
        />
        <View style={styles.menuCard}>
          {renderMenuItem({
            accessibilityLabel: `Rename session ${sessionName}`,
            iconName: 'pencil-outline',
            onPress: () => {
              handleOpenRenamePrompt(profileId, sessionName);
            },
            testID: `servers-drawer-rename-${profileId}-${sessionName}`,
            title: 'Rename',
          })}
          {renderMenuItem({
            accessibilityLabel: `Clone session ${sessionName}`,
            iconName: 'content-copy',
            onPress: () => {
              handleCloneSession(profileId, sessionName);
            },
            testID: `servers-drawer-clone-${profileId}-${sessionName}`,
            title: 'Clone',
          })}
          {renderMenuItem({
            accessibilityLabel: `Kill session ${sessionName}`,
            color: ERROR_COLOR,
            iconName: 'trash-can-outline',
            isDanger: true,
            onPress: () => {
              handleDeleteSessionPress(profileId, sessionName);
            },
            testID: `servers-drawer-kill-${profileId}-${sessionName}`,
            title: 'Kill session',
          })}
        </View>
      </View>
    );
  };

  const renderMenu = () => {
    if (menuTarget === null) {
      return null;
    }
    if (menuTarget.kind === 'server') {
      const server = servers.find((candidate) => {
        return candidate.profileId === menuTarget.profileId;
      });
      if (server === undefined) {
        return null;
      }

      return renderServerMenu(server);
    }

    const server = servers.find((candidate) => {
      return candidate.profileId === menuTarget.profileId;
    });
    if (server === undefined || !server.sessionNames.includes(menuTarget.sessionName)) {
      return null;
    }

    return renderSessionMenu(menuTarget.profileId, menuTarget.sessionName);
  };

  const renderSessionRow = (server: ServersDrawerServer, sessionName: string) => {
    const isCurrentSession =
      server.profileId === currentProfileId && sessionName === server.currentSessionName;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isCurrentSession }}
        key={`${server.profileId}-${sessionName}`}
        onPress={() => {
          onSelectSession(server.profileId, sessionName);
        }}
        style={({ pressed }) => {
          return [
            styles.sessionRow,
            isCurrentSession ? styles.sessionRowCurrent : null,
            pressed ? styles.sessionRowPressed : null,
          ];
        }}
        testID={`tmux-session-row-${server.profileId}-${sessionName}`}
      >
        <MaterialCommunityIcons
          color={isCurrentSession ? CURRENT_SESSION_COLOR : MUTED_COLOR}
          name="console"
          size={18}
        />
        <Text numberOfLines={1} style={[styles.sessionName, isCurrentSession ? styles.sessionNameCurrent : null]}>
          {sessionName}
        </Text>
        <Pressable
          accessibilityLabel={`Session actions for ${sessionName}`}
          accessibilityRole="button"
          onPress={() => {
            setMenuTarget({ kind: 'session', profileId: server.profileId, sessionName });
          }}
          style={styles.sessionActionButton}
          testID={`servers-drawer-session-menu-${server.profileId}-${sessionName}`}
        >
          <MaterialCommunityIcons color={MUTED_COLOR} name="dots-vertical" size={18} />
        </Pressable>
      </Pressable>
    );
  };

  const renderServerBody = (server: ServersDrawerServer) => {
    if (server.status === 'disconnected') {
      return <Text style={styles.hintText}>Not connected</Text>;
    }
    // A reload keeps the already-loaded sessions on screen until the fresh
    // list lands; the instance row spinner signals the refresh in flight.
    if (server.isLoading && server.sessionNames.length === 0) {
      return <Text style={styles.hintText}>Loading…</Text>;
    }
    if (server.listError !== null) {
      return <Text style={styles.errorText}>{server.listError}</Text>;
    }
    if (server.sessionNames.length === 0) {
      return <Text style={styles.hintText}>No tmux sessions</Text>;
    }
    return server.sessionNames.map((sessionName) => {
      return renderSessionRow(server, sessionName);
    });
  };

  const renderServerGroup = (server: ServersDrawerServer) => {
    const isCollapsed = collapsedProfileIds.includes(server.profileId);
    const isCurrentServer = server.profileId === currentProfileId;

    return (
      <View key={server.profileId} style={[styles.serverGroup, isCurrentServer ? styles.serverGroupCurrent : null]}>
        <View style={styles.serverHeader}>
          <Pressable
            accessibilityLabel={`${isCollapsed ? 'Expand' : 'Collapse'} sessions for ${server.displayName}`}
            accessibilityRole="button"
            onPress={() => {
              handleToggleCollapse(server.profileId);
            }}
            style={styles.chevronButton}
            testID={`servers-drawer-chevron-${server.profileId}`}
          >
            <MaterialCommunityIcons
              color={MUTED_COLOR}
              name={isCollapsed ? 'chevron-right' : 'chevron-down'}
              size={20}
            />
          </Pressable>
          <Pressable
            accessibilityLabel={`Select instance ${server.displayName}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrentServer }}
            onPress={() => {
              onSelectServer(server.profileId);
            }}
            style={({ pressed }) => {
              return [styles.serverNameButton, pressed ? styles.serverNamePressed : null];
            }}
            testID={`servers-drawer-server-${server.profileId}`}
          >
            <View style={[styles.statusDot, { backgroundColor: statusColorOf(server.status) }]} />
            <Text numberOfLines={1} style={[styles.serverName, isCurrentServer ? styles.serverNameCurrent : null]}>
              {server.displayName}
            </Text>
          </Pressable>
          {server.isLoading ? (
            <ActivityIndicator
              accessibilityLabel={`Refreshing sessions for ${server.displayName}`}
              color={MUTED_COLOR}
              size="small"
              style={styles.serverLoadingIndicator}
              testID={`servers-drawer-loading-${server.profileId}`}
            />
          ) : null}
          <Pressable
            accessibilityLabel={`Instance actions for ${server.displayName}`}
            accessibilityRole="button"
            onPress={() => {
              setMenuTarget({ kind: 'server', profileId: server.profileId });
            }}
            style={styles.serverActionButton}
            testID={`servers-drawer-menu-${server.profileId}`}
          >
            <MaterialCommunityIcons color={MUTED_COLOR} name="dots-vertical" size={20} />
          </Pressable>
        </View>
        {isCollapsed ? null : <View style={styles.serverBody}>{renderServerBody(server)}</View>}
      </View>
    );
  };

  return (
    <Modal animationType="none" onRequestClose={handleClose} statusBarTranslucent transparent visible={isOpen}>
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
          testID="servers-drawer"
        >
          <View style={styles.drawerHeader}>
            <View style={styles.drawerTitleRow}>
              <Image
                source={require('@resource/icon/adaptive-icon.png')}
                style={styles.drawerTitleIcon}
                testID="servers-drawer-app-icon"
              />
              <Text numberOfLines={1} style={styles.drawerTitle}>
                {appInfo.name}
              </Text>
            </View>
            <View style={styles.drawerHeaderActions}>
              <Pressable accessibilityLabel="Add instance" accessibilityRole="button" onPress={onAddServer}>
                <MaterialCommunityIcons color={constant.terminal.fg} name="plus" size={22} />
              </Pressable>
              <Pressable accessibilityLabel="Close instances drawer" accessibilityRole="button" onPress={handleClose}>
                <MaterialCommunityIcons color={constant.terminal.fg} name="close" size={22} />
              </Pressable>
            </View>
          </View>
          <ScrollView style={styles.serverList}>
            {servers.length === 0 ? <Text style={styles.hintText}>No instances yet</Text> : null}
            {servers.map((server) => {
              return renderServerGroup(server);
            })}
          </ScrollView>
          <View style={styles.drawerFooter}>
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={onOpenSettings}
              style={({ pressed }) => {
                return [styles.footerRow, pressed ? styles.sessionRowPressed : null];
              }}
              testID="tmux-settings-row"
            >
              <MaterialCommunityIcons color={MUTED_COLOR} name="cog-outline" size={18} />
              <Text numberOfLines={1} style={styles.footerRowText}>
                Settings
              </Text>
            </Pressable>
          </View>
        </Animated.View>
        <Pressable accessibilityLabel="Close instances drawer" onPress={handleClose} style={styles.backdropPressable} />
        {renderMenu()}
        {createTarget !== null ? (
          <View style={styles.promptOverlay}>
            <Pressable
              accessibilityLabel="Cancel new session"
              onPress={handleCancelNamePrompt}
              style={styles.promptBackdropPressable}
            />
            <View style={styles.promptCard}>
              <Text style={styles.promptServerName}>{createTarget.displayName}</Text>
              <Text style={styles.promptTitle}>New session</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onChangeText={setSessionNameInput}
                onSubmitEditing={handleCreateSession}
                placeholder={tmuxAttachUtil.toNextSessionName({ sessionNames: createTarget.sessionNames })}
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
                  placeholder={createTarget.defaultPath === '' ? '/' : createTarget.defaultPath}
                  placeholderTextColor={MUTED_COLOR}
                  style={[styles.promptInput, styles.promptPathInput]}
                  testID="tmux-new-session-path-input"
                  value={pathInput}
                />
                {openBrowseSession !== undefined ? (
                  <Pressable
                    accessibilityLabel="Browse remote folders"
                    accessibilityRole="button"
                    onPress={() => {
                      setIsBrowserVisible(true);
                    }}
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
        {renameTarget !== null ? (
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
        {openBrowseSession !== undefined && createTarget !== null ? (
          <FolderBrowserModal
            initialPath={toBrowseInitialPath()}
            isVisible={isBrowserVisible}
            openSession={() => {
              return openBrowseSession(createTarget.profileId);
            }}
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
  chevronButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 26,
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
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  drawerTitleIcon: {
    borderRadius: 6,
    height: 24,
    width: 24,
  },
  drawerTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  footerRowText: {
    color: constant.terminal.fg,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
    marginLeft: 8,
  },
  hintText: {
    color: MUTED_COLOR,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 16,
  },
  menuBackdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  menuCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 8,
    marginTop: 160,
    marginHorizontal: 16,
    maxWidth: 220,
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemPressed: {
    backgroundColor: ROW_PRESSED_BG,
  },
  menuItemText: {
    color: constant.terminal.fg,
    fontSize: 14,
  },
  menuItemTextDanger: {
    color: ERROR_COLOR,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFill,
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
  promptBrowseButton: {
    paddingVertical: 6,
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
  promptOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: BACKDROP_COLOR,
    justifyContent: 'center',
  },
  promptServerName: {
    color: MUTED_COLOR,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  promptTitle: {
    color: constant.terminal.fg,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  serverActionButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  serverBody: {
    paddingBottom: 4,
  },
  serverGroup: {
    borderTopColor: '#222222',
    borderTopWidth: 1,
  },
  serverGroupCurrent: {
    backgroundColor: CURRENT_SERVER_BG,
  },
  serverHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
  },
  serverList: {
    flex: 1,
  },
  serverName: {
    color: constant.terminal.fg,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  serverNameButton: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  serverNameCurrent: {
    fontWeight: '700',
  },
  serverNamePressed: {
    opacity: 0.7,
  },
  serverLoadingIndicator: {
    marginHorizontal: 2,
  },
  sessionActionButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
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
    backgroundColor: ROW_PRESSED_BG,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
});
