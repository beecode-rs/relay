import { type JSX, type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Appbar, Menu } from 'react-native-paper';

import { IconButton } from '@/components/icon-button';
import { useThemePreference } from '@/components/theme/theme-context';

export type AppTopBarAction = {
  icon: string;
  key: string;
  onPress: () => void;
  testID?: string;
  tip: string;
}

export type AppTopBarMenuAction = {
  icon: string;
  key: string;
  onPress: () => void;
  testID?: string;
  title: string;
}

export type AppTopBarProps = {
  actions?: AppTopBarAction[];
  menuActions?: AppTopBarMenuAction[];
  onPressBack?: () => void;
  onPressSettings?: () => void;
  testID?: string;
  title: ReactNode;
}

export const AppTopBar = ({ actions, menuActions = [], onPressBack, onPressSettings, testID, title }: AppTopBarProps): JSX.Element => {
  const { md3Theme } = useThemePreference();
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const openMenu = (): void => {
    setIsMenuVisible(true);
  };

  const closeMenu = (): void => {
    setIsMenuVisible(false);
  };

  const handleSettingsPress = (): void => {
    closeMenu();

    if (onPressSettings !== undefined) {
      onPressSettings();
    }
  };

  const handleMenuActionPress = (action: AppTopBarMenuAction): void => {
    closeMenu();
    action.onPress();
  };

  const renderAction = (action: AppTopBarAction): JSX.Element => {
    return (
      <IconButton
        icon={action.icon}
        iconColor={md3Theme.colors.onSurface}
        key={action.key}
        onPress={action.onPress}
        testID={action.testID}
        tip={action.tip}
      />
    );
  };

  const renderMenuAction = (action: AppTopBarMenuAction): JSX.Element => {
    return (
      <Menu.Item
        key={action.key}
        leadingIcon={action.icon}
        onPress={() => {
          handleMenuActionPress(action);
        }}
        testID={action.testID}
        title={action.title}
      />
    );
  };

  const hasMenuItems = menuActions.length > 0 || onPressSettings !== undefined;

  return (
    <Appbar.Header
      mode="small"
      style={[
        styles.header,
        { backgroundColor: md3Theme.colors.surface, borderBottomColor: md3Theme.colors.outlineVariant },
      ]}
      testID={testID}
    >
      {onPressBack !== undefined && (
        <Appbar.BackAction color={md3Theme.colors.onSurface} onPress={onPressBack} testID="app-top-bar-back" />
      )}
      <Appbar.Content color={md3Theme.colors.onSurface} title={title} />
      {actions?.map(renderAction)}
      {hasMenuItems && (
        <Menu
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor={md3Theme.colors.onSurface}
              onPress={openMenu}
              testID="app-top-bar-more-options"
              tip="More options"
            />
          }
          onDismiss={closeMenu}
          visible={isMenuVisible}
        >
          {onPressSettings !== undefined && (
            <Menu.Item leadingIcon="cog" onPress={handleSettingsPress} title="Settings" />
          )}
          {menuActions.map(renderMenuAction)}
        </Menu>
      )}
    </Appbar.Header>
  );
};

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
