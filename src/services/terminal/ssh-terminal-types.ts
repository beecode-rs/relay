export type SshAuth =
  | { kind: 'password'; password: string }
  | { kind: 'privateKey'; privateKey: string; passphrase?: string };

export type SshConnectOptions = {
  host: string;
  label?: string;
  port: number;
  username: string;
  auth: SshAuth;
  cols: number;
  rows: number;
  acceptedHostKeys: string[];
  remotePath?: string;
  lastTmuxSessionName?: string;
};

export type SshBridgeErrorCode =
  | 'auth'
  | 'network'
  | 'timeout'
  | 'host-key-unknown'
  | 'host-key-changed'
  | 'unsupported'
  | 'unknown';

export type SshBridgeError = Error & {
  code: SshBridgeErrorCode;
  fingerprint?: string;
  hostKeyLine?: string;
};

export type SshExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type SshRemoteDirEntry = {
  name: string;
  isDirectory: boolean;
};

export type SshBridgeEventData = { value: string };
export type SshBridgeEventClosed = { reason: string };
export type SshBridgeEventError = { code: SshBridgeErrorCode; message: string };

export type SshBridgeEventName = 'data' | 'closed' | 'error';

export type SshBridgeEventPayloads = {
  data: SshBridgeEventData;
  closed: SshBridgeEventClosed;
  error: SshBridgeEventError;
};

export type SshBridgeEventSubscription = { remove: () => void };

export type SshBridgeNativeEvents = {
  data: (event: SshBridgeEventData) => void;
  closed: (event: SshBridgeEventClosed) => void;
  error: (event: SshBridgeEventError) => void;
};
