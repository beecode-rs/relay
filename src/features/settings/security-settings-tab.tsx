import { type JSX, useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Switch } from 'react-native-paper';

import { useSecurityPreference } from '@/components/security-preference-context';
import { SettingsRow } from '@/features/settings/settings-row';
import { SettingsSection } from '@/features/settings/settings-section';
import { biometricAuthService } from '@/services/security/biometric-auth-service';

export const SecuritySettingsTab = (): JSX.Element => {
  const { preference, savePreference } = useSecurityPreference();
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [isAvailabilityLoaded, setIsAvailabilityLoaded] = useState(false);

  const resolveAvailability = useCallback(async (): Promise<boolean> => {
    return biometricAuthService.isBiometricAvailable().catch(() => {
      return false;
    });
  }, []);

  useEffect(() => {
    const loadAvailability = async (): Promise<void> => {
      const isAvailable = await resolveAvailability();
      setIsAvailabilityLoaded(true);
      setIsBiometricAvailable(isAvailable);
    };
    void loadAvailability();
  }, [resolveAvailability]);

  const enableBiometricLock = async (): Promise<void> => {
    const isAvailable = await resolveAvailability();
    setIsAvailabilityLoaded(true);
    setIsBiometricAvailable(isAvailable);
    if (!isAvailable) {
      Alert.alert(
        'Biometric lock unavailable',
        'Fingerprint or face unlock is not set up on this device. Set it up in your device settings and try again.',
        [{ text: 'OK' }]
      );

      return;
    }
    await savePreference({ ...preference, isBiometricLockEnabled: true });
  };

  const handleToggleBiometricLock = (nextValue: boolean): void => {
    if (!nextValue) {
      void savePreference({ ...preference, isBiometricLockEnabled: false });

      return;
    }
    void enableBiometricLock();
  };

  const resolveLockDescription = (): string => {
    if (!isAvailabilityLoaded) {
      return 'Checking biometric unlock availability…';
    }
    if (!isBiometricAvailable) {
      return 'Set up fingerprint or face unlock in your device settings to enable the lock';
    }

    return 'Require fingerprint or face unlock when Relay starts';
  };

  return (
    <SettingsSection title="App lock">
      <SettingsRow
        control={
          <Switch
            onValueChange={handleToggleBiometricLock}
            testID="biometric-lock-switch"
            value={preference.isBiometricLockEnabled}
          />
        }
        description={resolveLockDescription()}
        label="Biometric lock"
      />
    </SettingsSection>
  );
};
