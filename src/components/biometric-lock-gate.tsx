import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { useSecurityPreference } from '@/components/security-preference-context';
import { useThemePreference } from '@/components/theme/theme-context';
import { biometricAuthService } from '@/services/security/biometric-auth-service';

type LockStatus = 'locked' | 'resolving' | 'unlocked';

type BiometricLockGateProps = {
  children: ReactNode;
};

export const BiometricLockGate = ({ children }: BiometricLockGateProps): JSX.Element | null => {
  const { md3Theme } = useThemePreference();
  const { isLoaded, preference } = useSecurityPreference();
  const [status, setStatus] = useState<LockStatus>('resolving');
  const hasResolvedStartupRef = useRef(false);

  const unlockWithBiometrics = useCallback(async (): Promise<void> => {
    try {
      const isAuthenticated = await biometricAuthService.authenticate({ promptMessage: 'Unlock Relay' });
      if (isAuthenticated) {
        setStatus('unlocked');

        return;
      }
      setStatus('locked');
    } catch {
      setStatus('locked');
    }
  }, []);

  const resolveStartupLock = useCallback(async (): Promise<void> => {
    try {
      const isBiometricAvailable = await biometricAuthService.isBiometricAvailable();
      if (!isBiometricAvailable) {
        setStatus('unlocked');

        return;
      }
      setStatus('locked');
      await unlockWithBiometrics();
    } catch {
      setStatus('unlocked');
    }
  }, [unlockWithBiometrics]);

  useEffect(() => {
    if (!isLoaded || !preference.isBiometricLockEnabled || hasResolvedStartupRef.current) {
      return;
    }
    hasResolvedStartupRef.current = true;
    void resolveStartupLock();
  }, [isLoaded, preference.isBiometricLockEnabled, resolveStartupLock]);

  const handleUnlockPress = (): void => {
    void unlockWithBiometrics();
  };

  if (!isLoaded) {
    return null;
  }

  if (!preference.isBiometricLockEnabled || status === 'unlocked') {
    return <>{children}</>;
  }

  if (status === 'resolving') {
    return null;
  }

  return (
    <View style={[styles.overlay, { backgroundColor: md3Theme.colors.background }]}>
      <MaterialCommunityIcons color={md3Theme.colors.onSurface} name="lock" size={56} />
      <Text style={[styles.title, { color: md3Theme.colors.onSurface }]} variant="headlineSmall">
        Relay is locked
      </Text>
      <Text style={[styles.hint, { color: md3Theme.colors.onSurfaceVariant }]} variant="bodyMedium">
        Use fingerprint or face unlock to continue
      </Text>
      <Button mode="contained" onPress={handleUnlockPress} testID="biometric-unlock-button">
        Unlock
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  hint: {
    textAlign: 'center',
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    marginTop: 8,
  },
});
