import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { HostKeyDialog } from '@/features/connect/host-key-dialog';
import type { HostKeyDialogVariant } from '@/features/connect/host-key-dialog';
import { useTheme } from '@/hooks/use-theme';

export type InstallStatus =
  | { kind: 'failed'; message: string }
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'succeeded'; note?: string };

export type PendingHostKey = {
  fingerprint: string;
  hostKeyLine: string;
  source: 'install' | 'test';
  variant: HostKeyDialogVariant;
};

export type DeviceKeyInstallModalProps = {
  isVisible: boolean;
  isBusy: boolean;
  password: string;
  installStatus: InstallStatus;
  pendingHostKey: PendingHostKey | null;
  onPasswordChange(value: string): void;
  onInstallPress(): void;
  onAcceptHostKey(): void;
  onRejectHostKey(): void;
  onClose(): void;
};

export function DeviceKeyInstallModal({
  isVisible,
  isBusy,
  password,
  installStatus,
  pendingHostKey,
  onPasswordChange,
  onInstallPress,
  onAcceptHostKey,
  onRejectHostKey,
  onClose,
}: DeviceKeyInstallModalProps) {
  const theme = useTheme();
  const borderedStyle = { borderColor: theme.textSecondary };
  const isInstallDisabled = password === '' || isBusy;

  const handleClosePress = () => {
    if (isBusy) {
      return;
    }
    onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={handleClosePress} statusBarTranslucent transparent visible={isVisible}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Cancel device key authentication"
          onPress={handleClosePress}
          style={styles.backdropPressable}
        />
        <ThemedView style={styles.card} testID="device-key-install-modal">
          <ThemedText type="smallBold">Authenticate Device Key</ThemedText>
          <ThemedText style={styles.hintText} type="small">
            Installs this device&apos;s public key on the server with your password, then verifies the connection.
          </ThemedText>
          <ThemedTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onPasswordChange}
            placeholder="password"
            secureTextEntry
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={isInstallDisabled}
            onPress={onInstallPress}
            style={[styles.button, borderedStyle, isInstallDisabled && styles.buttonDisabled]}
          >
            <ThemedText type="smallBold">Install key on server</ThemedText>
          </Pressable>
          {installStatus.kind === 'installing' ? (
            <ThemedText style={styles.statusText} type="small">
              Installing key…
            </ThemedText>
          ) : null}
          {installStatus.kind === 'succeeded' ? (
            <ThemedText style={styles.statusText} type="small">
              {installStatus.note !== undefined
                ? `Key installed — verifying… (${installStatus.note})`
                : 'Key installed — verifying…'}
            </ThemedText>
          ) : null}
          {installStatus.kind === 'failed' ? (
            <ThemedText style={styles.errorText} type="small">
              {installStatus.message}
            </ThemedText>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={handleClosePress}
              style={[styles.button, borderedStyle, isBusy && styles.buttonDisabled]}
            >
              <ThemedText type="smallBold">Close</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
      {pendingHostKey !== null ? (
        <HostKeyDialog
          fingerprint={pendingHostKey.fingerprint}
          onAccept={onAcceptHostKey}
          onReject={onRejectHostKey}
          variant={pendingHostKey.variant}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    borderRadius: 12,
    gap: 8,
    maxWidth: 400,
    padding: 16,
    width: '90%',
  },
  hintText: {
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#d32f2f',
  },
  statusText: {
    marginTop: 8,
  },
});
