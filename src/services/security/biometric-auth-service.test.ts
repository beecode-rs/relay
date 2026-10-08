import type * as LocalAuthentication from 'expo-local-authentication';

import type { LocalAuthenticationLike } from '@/services/security/biometric-auth-service';
import { BiometricAuthService } from '@/services/security/biometric-auth-service';

jest.mock('expo-local-authentication', () => {
  return {
    authenticateAsync: jest.fn(),
    hasHardwareAsync: jest.fn(),
    isEnrolledAsync: jest.fn(),
  };
});

const createLocalAuthentication = (params: {
  authenticateResults: LocalAuthentication.LocalAuthenticationResult[];
  hasHardware: boolean;
  isEnrolled: boolean;
}): LocalAuthenticationLike => {
  const fallbackResult: LocalAuthentication.LocalAuthenticationResult = { error: 'unknown', success: false };

  return {
    authenticateAsync: jest.fn(async () => {
      return params.authenticateResults.shift() ?? fallbackResult;
    }),
    hasHardwareAsync: jest.fn(async () => {
      return params.hasHardware;
    }),
    isEnrolledAsync: jest.fn(async () => {
      return params.isEnrolled;
    }),
  };
};

describe('BiometricAuthService', () => {
  describe('isBiometricAvailable', () => {
    it('is available when hardware exists and biometrics are enrolled', async () => {
      const service = new BiometricAuthService({
        localAuthentication: createLocalAuthentication({ authenticateResults: [], hasHardware: true, isEnrolled: true }),
      });

      await expect(service.isBiometricAvailable()).resolves.toBe(true);
    });

    it('is unavailable without biometric hardware', async () => {
      const service = new BiometricAuthService({
        localAuthentication: createLocalAuthentication({ authenticateResults: [], hasHardware: false, isEnrolled: true }),
      });

      await expect(service.isBiometricAvailable()).resolves.toBe(false);
    });

    it('is unavailable when no biometrics are enrolled', async () => {
      const service = new BiometricAuthService({
        localAuthentication: createLocalAuthentication({ authenticateResults: [], hasHardware: true, isEnrolled: false }),
      });

      await expect(service.isBiometricAvailable()).resolves.toBe(false);
    });
  });

  describe('authenticate', () => {
    it('passes the prompt message and resolves true on success', async () => {
      const localAuthentication = createLocalAuthentication({
        authenticateResults: [{ success: true }],
        hasHardware: true,
        isEnrolled: true,
      });
      const service = new BiometricAuthService({ localAuthentication });

      await expect(service.authenticate({ promptMessage: 'Unlock Relay' })).resolves.toBe(true);
      expect(localAuthentication.authenticateAsync).toHaveBeenCalledWith({ promptMessage: 'Unlock Relay' });
    });

    it('resolves false when authentication fails', async () => {
      const service = new BiometricAuthService({
        localAuthentication: createLocalAuthentication({
          authenticateResults: [{ error: 'user_cancel', success: false }],
          hasHardware: true,
          isEnrolled: true,
        }),
      });

      await expect(service.authenticate({ promptMessage: 'Unlock Relay' })).resolves.toBe(false);
    });
  });
});
