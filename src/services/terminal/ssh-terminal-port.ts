import { Ssh2ShellClient } from '@/services/ssh/ssh2-shell-client';
import type {
  SshBridgeEventName,
  SshBridgeEventSubscription,
  SshBridgeNativeEvents,
  SshConnectOptions,
  SshExecResult,
  SshRemoteDirEntry,
} from '@/services/terminal/ssh-terminal-types';

export type SshTerminalEventSubscription = SshBridgeEventSubscription;

export type SshTerminalPort = {
  readonly isSupported: boolean;
  connect(options: SshConnectOptions): Promise<void>;
  exec(command: string): Promise<SshExecResult>;
  runInLoginShell(command: string): Promise<void>;
  readDir(params: { path: string }): Promise<SshRemoteDirEntry[]>;
  write(data: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  disconnect(): void;
  addListener<E extends SshBridgeEventName>(
    eventName: E,
    listener: SshBridgeNativeEvents[E]
  ): SshTerminalEventSubscription;
  removeListeners(): void;
};

export const sshTerminalPort: SshTerminalPort = new Ssh2ShellClient();
