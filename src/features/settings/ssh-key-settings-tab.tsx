import * as Clipboard from 'expo-clipboard';
import { type JSX, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { useThemePreference } from '@/components/theme/theme-context';
import { DeviceKeyRenameDialog } from '@/features/settings/device-key-rename-dialog';
import { SettingsSection } from '@/features/settings/settings-section';
import type { DeviceKeyPublicInfo } from '@/services/connection/device-key';
import { deviceKeyService } from '@/services/connection/device-key';

export const SshKeySettingsTab = (): JSX.Element => {
  const { md3Theme } = useThemePreference();
  const [deviceKey, setDeviceKey] = useState<DeviceKeyPublicInfo | null>(null);
  const [deviceKeyError, setDeviceKeyError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    const loadKey = async () => {
      try {
        setDeviceKey(await deviceKeyService.find());
        setDeviceKeyError(null);
      } catch (error) {
        setDeviceKeyError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoaded(true);
      }
    };
    void loadKey();
  }, []);

  const generateKey = async () => {
    setIsBusy(true);
    try {
      setDeviceKey(await deviceKeyService.regenerate());
      setDeviceKeyError(null);
      setHasCopied(false);
    } catch (error) {
      setDeviceKeyError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const confirmGenerateKey = () => {
    Alert.alert(
      'Generate new key',
      'The current device key will be replaced. Instances that trust it will stop accepting this device until the new key is installed.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Generate',
          onPress: () => {
            void generateKey();
          },
        },
      ]
    );
  };

  const handleGeneratePress = () => {
    if (deviceKey !== null) {
      confirmGenerateKey();

      return;
    }
    void generateKey();
  };

  const removeKey = async () => {
    setIsBusy(true);
    try {
      await deviceKeyService.remove();
      setDeviceKey(null);
      setDeviceKeyError(null);
      setHasCopied(false);
    } catch (error) {
      setDeviceKeyError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const openRenameDialog = () => {
    setRenameText(deviceKey?.comment ?? '');
    setIsRenameDialogVisible(true);
  };

  const handleRenameCancel = () => {
    setIsRenameDialogVisible(false);
  };

  const renameKey = async () => {
    if (deviceKey === null) {
      return;
    }
    setIsBusy(true);
    try {
      const renamed = await deviceKeyService.rename({ comment: renameText });
      if (renamed !== null) {
        setDeviceKey(renamed);
      }
      setIsRenameDialogVisible(false);
      setDeviceKeyError(null);
    } catch (error) {
      setDeviceKeyError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemovePress = () => {
    Alert.alert(
      'Remove device key',
      'The device key will be deleted from this device. Instances that trust it will stop accepting this device.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Remove',
          onPress: () => {
            void removeKey();
          },
        },
      ]
    );
  };

  const handleCopyPress = async () => {
    if (deviceKey === null) {
      return;
    }
    await Clipboard.setStringAsync(deviceKey.publicKey);
    setHasCopied(true);
  };

  const secondaryTextStyle = { color: md3Theme.colors.onSurfaceVariant };

  return (
    <>
      <SettingsSection title="Device key">
      {deviceKeyError !== null ? (
        <Text style={{ color: md3Theme.colors.error }} variant="bodySmall">
          Device key unavailable: {deviceKeyError}
        </Text>
      ) : null}
      {!isLoaded ? (
        <Text style={secondaryTextStyle} variant="bodySmall">
          Loading device key…
        </Text>
      ) : deviceKey === null ? (
        <Text style={secondaryTextStyle} variant="bodySmall">
          No device key on this device yet.
        </Text>
      ) : (
        <View style={styles.details}>
          <Text numberOfLines={1} style={{ color: md3Theme.colors.onSurface }} variant="bodyLarge">
            {deviceKey.comment}
          </Text>
          <Text style={secondaryTextStyle} variant="bodySmall">
            Created {new Date(deviceKey.createdAt).toLocaleString()}
          </Text>
          <Text selectable style={[styles.publicKey, secondaryTextStyle]} testID="device-key-public-key" variant="bodySmall">
            {deviceKey.publicKey}
          </Text>
        </View>
      )}
      {hasCopied ? (
        <Text style={secondaryTextStyle} variant="bodySmall">
          Public key copied to clipboard
        </Text>
      ) : null}
      <View style={styles.actions}>
        {deviceKey !== null ? (
          <Button disabled={isBusy} onPress={openRenameDialog} testID="device-key-rename-button">
            Rename Key
          </Button>
        ) : null}
        {deviceKey !== null ? (
          <Button
            disabled={isBusy}
            onPress={() => {
              void handleCopyPress();
            }}
            testID="device-key-copy-button"
          >
            Copy Public Key
          </Button>
        ) : null}
        <Button disabled={isBusy} mode="contained" onPress={handleGeneratePress} testID="device-key-generate-button">
          {deviceKey !== null ? 'Generate New Key' : 'Generate Device Key'}
        </Button>
        {deviceKey !== null ? (
          <Button disabled={isBusy} onPress={handleRemovePress} testID="device-key-remove-button" textColor={md3Theme.colors.error}>
            Remove Key
          </Button>
        ) : null}
      </View>
      </SettingsSection>
      {deviceKey !== null ? (
        <DeviceKeyRenameDialog
          isVisible={isRenameDialogVisible}
          isBusy={isBusy}
          name={renameText}
          onCancel={handleRenameCancel}
          onConfirm={() => {
            void renameKey();
          }}
          onNameChange={setRenameText}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  details: {
    gap: 4,
  },
  publicKey: {
    fontFamily: 'monospace',
  },
});
