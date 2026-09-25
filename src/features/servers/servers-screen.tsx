import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { Button, List, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { constant } from '@/constants/constant';
import { AppTopBar } from '@/components/app-top-bar';
import { ConfirmModal } from '@/components/confirm-modal';
import { useThemePreference } from '@/components/theme/theme-context';
import { appInfo } from '@/constants/app';
import { ServerRowMenu } from '@/features/servers/server-row-menu';
import type { ServerProfile } from '@/services/connection/server-profile';
import { serverProfileStore } from '@/services/connection/server-profile-store';
import type { ServerProfileStore } from '@/services/connection/server-profile-store';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const AUTH_METHOD_ICONS: Record<ServerProfile['authMethod'], IconName> = {
  deviceKey: 'cellphone-key',
  password: 'form-textbox-password',
  privateKey: 'certificate-outline',
};

export type ServersScreenProps = {
  store?: ServerProfileStore;
};

export function ServersScreen({ store = serverProfileStore }: ServersScreenProps) {
  const { md3Theme } = useThemePreference();
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ServerProfile | undefined>(undefined);

  const reload = useCallback(() => {
    const load = async () => {
      setServers(await store.list());
    };
    void load();
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleServerPress = (server: ServerProfile) => {
    router.navigate({ params: { id: server.id }, pathname: '/terminal' });
  };

  const handleEditPress = (server: ServerProfile) => {
    router.push({ params: { id: server.id }, pathname: '/connect' });
  };

  const handleAddPress = () => {
    router.push('/connect');
  };

  const handleClonePress = (server: ServerProfile) => {
    router.push({ params: { cloneId: server.id }, pathname: '/connect' });
  };

  const handleAboutPress = () => {
    router.push('/about');
  };

  const handleSettingsPress = () => {
    router.navigate('/settings');
  };

  const handleDeletePress = (server: ServerProfile) => {
    setDeleteTarget(server);
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(undefined);
  };

  const handleDeleteConfirm = () => {
    const id = deleteTarget?.id;

    if (id === undefined) {
      return;
    }
    setDeleteTarget(undefined);
    void store.remove({ id }).then(reload);
  };

  const renderRow = ({ item }: { item: ServerProfile }) => {
    return (
      <List.Item
        description={
          <Text numberOfLines={1} style={[styles.rowHost, { color: md3Theme.colors.onSurfaceVariant }]}>
            <MaterialCommunityIcons
              color={md3Theme.colors.onSurfaceVariant}
              name={AUTH_METHOD_ICONS[item.authMethod]}
              size={14}
              style={styles.rowHostAuthIcon}
            />{' '}
            {`${item.username}@${item.host}:${String(item.port)}`}
          </Text>
        }
        descriptionNumberOfLines={1}
        left={() => {
          return <List.Icon color={md3Theme.colors.onSurfaceVariant} icon="server" style={styles.rowLeadingIcon} />;
        }}
        onPress={() => {
          handleServerPress(item);
        }}
        right={() => {
          return (
            <ServerRowMenu
              onClonePress={handleClonePress}
              onDeletePress={handleDeletePress}
              onEditPress={handleEditPress}
              server={item}
            />
          );
        }}
        style={[styles.row, { backgroundColor: md3Theme.colors.surfaceVariant }]}
        testID={`server-row-${item.id}`}
        title={item.label}
        titleStyle={styles.rowTitle}
      />
    );
  };

  const renderTitle = () => {
    return (
      <View style={styles.titleRow}>
        <Image source={require('@resource/icon/adaptive-icon.png')} style={styles.titleIcon} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: md3Theme.colors.onSurface }} variant="titleLarge">
          {appInfo.name}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: md3Theme.colors.background }]}>
      <AppTopBar
        actions={[
          { icon: 'plus', key: 'add-server', onPress: handleAddPress, testID: 'server-add', tip: 'Add server' },
        ]}
        menuActions={[
          { icon: 'information-outline', key: 'about', onPress: handleAboutPress, testID: 'server-about', title: 'About' },
        ]}
        onPressSettings={handleSettingsPress}
        testID="servers-top-bar"
        title={renderTitle()}
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={servers}
        keyExtractor={(item) => {
          return item.id;
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText} variant="titleMedium">
              No servers configured yet.
            </Text>
            <Text style={styles.emptyHint} variant="bodyMedium">
              Add a server to start an SSH terminal session.
            </Text>
            <Button icon="plus" mode="contained" onPress={handleAddPress} style={styles.emptyAction}>
              Add new server
            </Button>
          </View>
        }
        renderItem={renderRow}
        style={styles.list}
      />
      <ConfirmModal
        confirmLabel="Delete"
        isDestructive
        isVisible={deleteTarget !== undefined}
        message={`Remove "${deleteTarget?.label ?? ''}" and its stored credentials?`}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete server"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 32,
  },
  emptyAction: {
    marginTop: 8,
  },
  emptyHint: {
    opacity: 0.7,
    textAlign: 'center',
  },
  emptyText: {
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 8,
    padding: 16,
  },
  row: {
    borderRadius: 12,
    paddingRight: 0,
    paddingVertical: 2,
  },
  rowHost: {
    fontFamily: constant.font.monoRegularFamily,
    fontSize: 13,
  },
  rowHostAuthIcon: {
    opacity: 0.6,
  },
  rowLeadingIcon: {
    paddingLeft: 8,
  },
  rowTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  safeArea: {
    flex: 1,
  },
  titleIcon: {
    borderRadius: 7,
    height: 28,
    width: 28,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
});
