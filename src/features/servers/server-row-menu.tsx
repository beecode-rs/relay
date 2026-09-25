import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, type JSX, useState } from 'react';
import { Menu } from 'react-native-paper';

import { IconButton } from '@/components/icon-button';
import { useThemePreference } from '@/components/theme/theme-context';
import type { ServerProfile } from '@/services/connection/server-profile';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type ServerRowMenuAction = {
  icon: IconName;
  iconColor: string;
  key: string;
  onPress: (server: ServerProfile) => void;
  testID: string;
  title: string;
}

export type ServerRowMenuProps = {
  onClonePress: (server: ServerProfile) => void;
  onDeletePress: (server: ServerProfile) => void;
  onEditPress: (server: ServerProfile) => void;
  server: ServerProfile;
}

export const ServerRowMenu = ({ onClonePress, onDeletePress, onEditPress, server }: ServerRowMenuProps): JSX.Element => {
  const { md3Theme } = useThemePreference();
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const actions: ServerRowMenuAction[] = [
    {
      icon: 'pencil',
      iconColor: md3Theme.colors.primary,
      key: 'edit',
      onPress: onEditPress,
      testID: `server-edit-${server.id}`,
      title: 'Edit',
    },
    {
      icon: 'content-copy',
      iconColor: md3Theme.colors.onSurfaceVariant,
      key: 'clone',
      onPress: onClonePress,
      testID: `server-clone-${server.id}`,
      title: 'Clone',
    },
    {
      icon: 'delete',
      iconColor: md3Theme.colors.error,
      key: 'delete',
      onPress: onDeletePress,
      testID: `server-delete-${server.id}`,
      title: 'Delete',
    },
  ];

  const handleActionPress = (action: ServerRowMenuAction): void => {
    setIsMenuVisible(false);
    action.onPress(server);
  };

  return (
    <Menu
      anchor={
        <IconButton
          icon="dots-vertical"
          iconColor={md3Theme.colors.onSurfaceVariant}
          onPress={() => {
            setIsMenuVisible(true);
          }}
          testID={`server-menu-${server.id}`}
          tip="Server actions"
        />
      }
      onDismiss={() => {
        setIsMenuVisible(false);
      }}
      visible={isMenuVisible}
    >
      {actions.map((action) => {
        return (
          <Menu.Item
            key={action.key}
            leadingIcon={(iconProps) => {
              return <MaterialCommunityIcons color={action.iconColor} name={action.icon} size={iconProps.size} />;
            }}
            onPress={() => {
              handleActionPress(action);
            }}
            testID={action.testID}
            title={action.title}
          />
        );
      })}
    </Menu>
  );
};
