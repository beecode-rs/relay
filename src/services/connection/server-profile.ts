import { randomBytes } from 'crypto';

export type ServerProfileAuthMethod = 'deviceKey' | 'password' | 'privateKey';

export type ServerProfile = {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authMethod: ServerProfileAuthMethod;
  acceptedHostKeys: string[];
  tmuxPrefix: string;
  remotePath?: string;
};

export type ServerProfileSecrets = {
  password?: string;
  privateKey?: string;
  passphrase?: string;
};

export type ServerProfileErrors = {
  host: string | null;
  port: string | null;
  username: string | null;
  tmuxPrefix: string | null;
};


const HOST_PATTERN = /^[A-Za-z0-9._-]+$/;
const TMUX_PREFIX_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

export const serverProfileIdUtil = {
  generateId(): string {
    return randomBytes(16).toString('hex');
  },
};

export const serverProfileTmuxUtil = {
  generatePrefix(): string {
    return randomBytes(3).toString('hex');
  },
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const isPortNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
};

export const hostTokenOf = (hostKeyLine: string): string => {
  return hostKeyLine.trim().split(/\s+/)[0] ?? '';
};

export const mergeAcceptedHostKey = (acceptedHostKeys: string[], hostKeyLine: string): string[] => {
  const hostToken = hostTokenOf(hostKeyLine);
  const otherHosts = acceptedHostKeys.filter((line) => {
    return hostTokenOf(line) !== hostToken;
  });

  return [...otherHosts, hostKeyLine];
};

export const serverProfileValidator = {
  validate(profile: Pick<ServerProfile, 'host' | 'port' | 'username' | 'tmuxPrefix'>): ServerProfileErrors {
    return {
      host: this.validateHost(profile?.host),
      port: this.validatePort(profile?.port),
      username: this.validateUsername(profile?.username),
      tmuxPrefix: this.validateTmuxPrefix(profile?.tmuxPrefix),
    };
  },

  isValid(profile: Pick<ServerProfile, 'host' | 'port' | 'username' | 'tmuxPrefix'>): boolean {
    const errors = this.validate(profile);

    return (
      errors.host === null && errors.port === null && errors.username === null && errors.tmuxPrefix === null
    );
  },

  validateHost(host: unknown): string | null {
    if (!isNonEmptyString(host)) {
      return 'Host is required';
    }
    if (!HOST_PATTERN.test(host)) {
      return 'Host may only contain letters, digits, dots, underscores and dashes';
    }

    return null;
  },

  validatePort(port: unknown): string | null {
    if (!isPortNumber(port)) {
      return 'Port must be an integer between 1 and 65535';
    }

    return null;
  },

  validateUsername(username: unknown): string | null {
    if (!isNonEmptyString(username)) {
      return 'Username is required';
    }

    return null;
  },

  validateTmuxPrefix(tmuxPrefix: unknown): string | null {
    if (!isNonEmptyString(tmuxPrefix)) {
      return 'Session ID is required';
    }
    if (!TMUX_PREFIX_PATTERN.test(tmuxPrefix)) {
      return 'Session ID may only contain letters, digits, underscores and dashes (at most 16)';
    }

    return null;
  },

  validateSecrets(params: {
    authMethod: ServerProfileAuthMethod;
    hasStoredSecrets: boolean;
    secrets: ServerProfileSecrets;
  }): string | null {
    if (params.authMethod === 'deviceKey') {
      return null;
    }
    if (params.authMethod === 'password') {
      if (isNonEmptyString(params.secrets.password) || params.hasStoredSecrets) {
        return null;
      }

      return 'Password is required';
    }
    if (isNonEmptyString(params.secrets.privateKey) || params.hasStoredSecrets) {
      return null;
    }

    return 'Private key is required';
  },
};
