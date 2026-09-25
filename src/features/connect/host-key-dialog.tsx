import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export type HostKeyDialogVariant = 'host-key-unknown' | 'host-key-changed';

export type HostKeyDialogProps = {
  variant: HostKeyDialogVariant;
  fingerprint: string;
  onAccept: () => void;
  onReject: () => void;
};

export function HostKeyDialog({ variant, fingerprint, onAccept, onReject }: HostKeyDialogProps) {
  const isChanged = variant === 'host-key-changed';

  return (
    <View style={styles.overlay} testID="host-key-dialog">
      <ThemedView style={styles.card}>
        <ThemedText type="smallBold">
          {isChanged ? 'Host key has changed' : 'Unknown host key'}
        </ThemedText>
        {isChanged ? (
          <ThemedText type="small" style={styles.warning}>
            The host key does not match the one saved for this host. This can indicate a
            man-in-the-middle attack. Only accept if you know the host was reinstalled or its
            keys were regenerated.
          </ThemedText>
        ) : (
          <ThemedText type="small">
            The authenticity of this host cannot be established. Verify the fingerprint out of
            band before accepting.
          </ThemedText>
        )}
        <ThemedText type="small">Server fingerprint:</ThemedText>
        <ThemedText type="code" style={styles.fingerprint}>
          {fingerprint}
        </ThemedText>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onReject} style={styles.rejectButton}>
            <ThemedText type="smallBold">Reject</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onAccept} style={styles.acceptButton}>
            <ThemedText type="smallBold">Accept</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  warning: {
    color: '#d32f2f',
  },
  fingerprint: {
    marginBottom: 16,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  rejectButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  acceptButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
