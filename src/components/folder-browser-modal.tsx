import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { constant } from '@/constants/constant';
import type { RemoteBrowseSession } from '@/services/terminal/remote-browse';
import { remotePathUtil } from '@/services/terminal/remote-path-util';

const BACKDROP_COLOR = 'rgba(0,0,0,0.5)';
const CARD_BG = '#1c1c1c';
const INPUT_BG = '#000000';
const MUTED_COLOR = '#9e9e9e';
const ERROR_COLOR = '#ef5350';

type BrowsePhase =
  | { kind: 'connecting' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready' };

export type FolderBrowserModalProps = {
  isVisible: boolean;
  initialPath: string;
  openSession: () => Promise<RemoteBrowseSession>;
  onCancel(): void;
  onSelect(path: string): void;
  onConnectError?(error: unknown): void;
};

export function FolderBrowserModal({
  isVisible,
  initialPath,
  openSession,
  onCancel,
  onSelect,
  onConnectError,
}: FolderBrowserModalProps) {
  const [phase, setPhase] = useState<BrowsePhase>({ kind: 'connecting' });
  const [currentPath, setCurrentPath] = useState('/');
  const [directoryNames, setDirectoryNames] = useState<string[]>([]);
  const [isListing, setIsListing] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [isShowingDotFolders, setIsShowingDotFolders] = useState(false);
  const sessionRef = useRef<RemoteBrowseSession | null>(null);
  const openSessionRef = useRef(openSession);
  const initialPathRef = useRef(initialPath);
  const onConnectErrorRef = useRef(onConnectError);

  useEffect(() => {
    openSessionRef.current = openSession;
  }, [openSession]);

  useEffect(() => {
    initialPathRef.current = initialPath;
  }, [initialPath]);

  useEffect(() => {
    onConnectErrorRef.current = onConnectError;
  }, [onConnectError]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const listAt = async (session: RemoteBrowseSession, path: string): Promise<boolean> => {
      try {
        const names = await session.listDirectories({ path });
        setCurrentPath(path);
        setDirectoryNames(names);
        setListingError(null);

        return true;
      } catch {
        return false;
      }
    };
    const start = async () => {
      setPhase({ kind: 'connecting' });
      setCurrentPath(remotePathUtil.normalizeRootPath({ path: initialPathRef.current }));
      setDirectoryNames([]);
      setListingError(null);
      setIsShowingDotFolders(false);
      try {
        const session = await openSessionRef.current();
        sessionRef.current = session;
        const startPath = remotePathUtil.normalizeRootPath({ path: initialPathRef.current });
        const hasListedStart = await listAt(session, startPath);
        if (hasListedStart) {
          setPhase({ kind: 'ready' });

          return;
        }
        const hasListedRoot = await listAt(session, '/');
        if (hasListedRoot) {
          setPhase({ kind: 'ready' });

          return;
        }
        setPhase({ kind: 'failed', message: `Could not list ${startPath}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onConnectErrorRef.current?.(error);
        setPhase({ kind: 'failed', message: `Connection failed: ${message}` });
      }
    };
    void start();

    return () => {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
    };
  }, [isVisible]);

  const listPath = async (path: string) => {
    const session = sessionRef.current;
    if (session === null) {
      return;
    }
    setIsListing(true);
    try {
      const names = await session.listDirectories({ path });
      setCurrentPath(path);
      setDirectoryNames(names);
      setListingError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setListingError(`Could not list ${path}: ${message}`);
    } finally {
      setIsListing(false);
    }
  };

  const handleParentPress = () => {
    void listPath(remotePathUtil.toParentDir({ path: currentPath }));
  };

  const handleFolderPress = (name: string) => {
    void listPath(remotePathUtil.join({ dir: currentPath, name }));
  };

  const handleUseFolderPress = () => {
    onSelect(currentPath);
  };

  const handleDotFoldersTogglePress = () => {
    setIsShowingDotFolders((current) => {
      return !current;
    });
  };

  const isVisibleFolderName = (name: string): boolean => {
    if (isShowingDotFolders) {
      return true;
    }

    return !name.startsWith('.');
  };

  const visibleDirectoryNames = directoryNames.filter(isVisibleFolderName);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} statusBarTranslucent transparent visible={isVisible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Cancel folder browsing" onPress={onCancel} style={styles.backdropPressable} />
        <View style={styles.card} testID="folder-browser-modal">
          <Text style={styles.title}>Choose folder</Text>
          <Text numberOfLines={1} style={styles.currentPath} testID="folder-browser-current-path">
            {currentPath}
          </Text>
          {phase.kind === 'ready' ? (
            <Pressable
              accessibilityLabel="Show dot folders"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isShowingDotFolders }}
              onPress={handleDotFoldersTogglePress}
              style={styles.dotFoldersToggle}
            >
              <MaterialCommunityIcons
                color={isShowingDotFolders ? constant.terminal.fg : MUTED_COLOR}
                name={isShowingDotFolders ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={18}
              />
              <Text
                style={[
                  styles.dotFoldersToggleText,
                  isShowingDotFolders ? styles.dotFoldersToggleTextActive : null,
                ]}
              >
                Show dot folders
              </Text>
            </Pressable>
          ) : null}
          <ScrollView style={styles.list}>
            {phase.kind === 'connecting' ? <Text style={styles.hintText}>Connecting…</Text> : null}
            {phase.kind === 'failed' ? <Text style={styles.errorText}>{phase.message}</Text> : null}
            {phase.kind === 'ready' ? (
              <>
                <Pressable
                  accessibilityLabel="Go to parent folder"
                  accessibilityRole="button"
                  onPress={handleParentPress}
                  style={({ pressed }) => {
                    return [styles.row, pressed ? styles.rowPressed : null];
                  }}
                >
                  <MaterialCommunityIcons color={MUTED_COLOR} name="arrow-up" size={18} />
                  <Text numberOfLines={1} style={styles.rowText}>
                    ..
                  </Text>
                </Pressable>
                {isListing ? <Text style={styles.hintText}>Loading…</Text> : null}
                {listingError !== null ? <Text style={styles.errorText}>{listingError}</Text> : null}
                {visibleDirectoryNames.map((name) => {
                  return (
                    <Pressable
                      accessibilityLabel={`Open folder ${name}`}
                      accessibilityRole="button"
                      key={name}
                      onPress={() => {
                        handleFolderPress(name);
                      }}
                      style={({ pressed }) => {
                        return [styles.row, pressed ? styles.rowPressed : null];
                      }}
                    >
                      <MaterialCommunityIcons color={MUTED_COLOR} name="folder" size={18} />
                      <Text numberOfLines={1} style={styles.rowText}>
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}>
              <Text style={styles.buttonTextMuted}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={phase.kind !== 'ready'}
              onPress={handleUseFolderPress}
              style={[styles.button, styles.useButton, phase.kind !== 'ready' && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>Use this folder</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: BACKDROP_COLOR,
    flex: 1,
    justifyContent: 'center',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  button: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: constant.terminal.fg,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextMuted: {
    color: MUTED_COLOR,
    fontSize: 14,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    maxHeight: '80%',
    maxWidth: 360,
    padding: 16,
    width: '90%',
  },
  currentPath: {
    backgroundColor: INPUT_BG,
    borderRadius: 6,
    color: constant.terminal.fg,
    fontFamily: 'monospace',
    fontSize: 13,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dotFoldersToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  dotFoldersToggleText: {
    color: MUTED_COLOR,
    fontSize: 13,
  },
  dotFoldersToggleTextActive: {
    color: constant.terminal.fg,
  },
  errorText: {
    color: ERROR_COLOR,
    fontFamily: 'monospace',
    fontSize: 13,
    paddingVertical: 8,
  },
  hintText: {
    color: MUTED_COLOR,
    fontFamily: 'monospace',
    fontSize: 13,
    paddingVertical: 8,
  },
  list: {
    flexGrow: 0,
    marginTop: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  rowPressed: {
    backgroundColor: '#222222',
    borderRadius: 6,
  },
  rowText: {
    color: constant.terminal.fg,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 14,
    marginLeft: 10,
  },
  title: {
    color: constant.terminal.fg,
    fontSize: 15,
    fontWeight: '700',
  },
  useButton: {
    backgroundColor: '#222222',
  },
});
