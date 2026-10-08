import * as LocalAuthentication from 'expo-local-authentication';

export type LocalAuthenticationLike = {
  authenticateAsync(
    options?: LocalAuthentication.LocalAuthenticationOptions
  ): Promise<LocalAuthentication.LocalAuthenticationResult>;
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
};

export class BiometricAuthService {
  protected readonly localAuthentication: LocalAuthenticationLike;

  constructor(params: { localAuthentication?: LocalAuthenticationLike } = {}) {
    this.localAuthentication = params.localAuthentication ?? LocalAuthentication;
  }

  async isBiometricAvailable(): Promise<boolean> {
    const [hasHardware, isEnrolled] = await Promise.all([
      this.localAuthentication.hasHardwareAsync(),
      this.localAuthentication.isEnrolledAsync(),
    ]);

    return hasHardware && isEnrolled;
  }

  async authenticate(params: { promptMessage: string }): Promise<boolean> {
    const result = await this.localAuthentication.authenticateAsync({
      promptMessage: params.promptMessage,
    });

    return result.success;
  }
}

export const biometricAuthService = new BiometricAuthService();
