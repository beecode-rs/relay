import type { SshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import type {
  SshBridgeErrorCode,
  SshBridgeEventClosed,
  SshBridgeEventData,
  SshBridgeEventError,
  SshBridgeEventName,
  SshBridgeNativeEvents,
  SshConnectOptions,
  SshExecResult,
  SshRemoteDirEntry,
} from '@/services/terminal/ssh-terminal-types';

export type MockConnectFailure = {
  code: SshBridgeErrorCode;
  message: string;
  fingerprint?: string;
  hostKeyLine?: string;
};

export type MockExecControls = {
  resolve(result: SshExecResult): void;
  reject(error: Error): void;
};

export type MockSshBridge = SshTerminalPort & {
  readonly connectCalls: SshConnectOptions[];
  readonly execCalls: string[];
  readonly loginShellCalls: string[];
  readonly readDirCalls: { path: string }[];
  readonly written: string[];
  readonly resizes: { cols: number; rows: number }[];
  readonly disconnectCount: number;
  deferNextExec(): MockExecControls;
  queueExecResult(result: SshExecResult | Error): void;
  queueReadDirEntries(entries: SshRemoteDirEntry[] | Error): void;
  failNextConnect(failure: MockConnectFailure): void;
  failNextLoginShell(error: Error): void;
  emitData(chunk: string): void;
  emitClosed(reason: string): void;
  emitError(event: SshBridgeEventError): void;
};

export const createMockSshBridge = (): MockSshBridge => {
  const dataListeners = new Set<(event: SshBridgeEventData) => void>();
  const closedListeners = new Set<(event: SshBridgeEventClosed) => void>();
  const errorListeners = new Set<(event: SshBridgeEventError) => void>();
  const connectCalls: SshConnectOptions[] = [];
  const execCalls: string[] = [];
  const loginShellCalls: string[] = [];
  const readDirCalls: { path: string }[] = [];
  const execQueue: (SshExecResult | Error | Promise<SshExecResult>)[] = [];
  const readDirQueue: (SshRemoteDirEntry[] | Error)[] = [];
  const written: string[] = [];
  const resizes: { cols: number; rows: number }[] = [];
  const state = {
    disconnectCount: 0,
    nextFailure: null as MockConnectFailure | null,
    nextLoginShellFailure: null as Error | null,
  };

  const toBridgeFailure = (failure: MockConnectFailure): Error & MockConnectFailure => {
    const error = new Error(failure.message) as Error & MockConnectFailure;
    error.code = failure.code;
    if (failure.fingerprint !== undefined) {
      error.fingerprint = failure.fingerprint;
    }
    if (failure.hostKeyLine !== undefined) {
      error.hostKeyLine = failure.hostKeyLine;
    }
    return error;
  };

  const subscribe = (event: SshBridgeEventName, listener: unknown): (() => void) => {
    if (event === 'data') {
      const typed = listener as (event: SshBridgeEventData) => void;
      dataListeners.add(typed);
      return () => {
        dataListeners.delete(typed);
      };
    }
    if (event === 'closed') {
      const typed = listener as (event: SshBridgeEventClosed) => void;
      closedListeners.add(typed);
      return () => {
        closedListeners.delete(typed);
      };
    }
    const typed = listener as (event: SshBridgeEventError) => void;
    errorListeners.add(typed);
    return () => {
      errorListeners.delete(typed);
    };
  };

  return {
    isSupported: true,
    connectCalls,
    execCalls,
    loginShellCalls,
    readDirCalls,
    written,
    resizes,
    get disconnectCount() {
      return state.disconnectCount;
    },
    async connect(options: SshConnectOptions): Promise<void> {
      connectCalls.push(options);
      if (state.nextFailure !== null) {
        const failure = state.nextFailure;
        state.nextFailure = null;
        throw toBridgeFailure(failure);
      }
    },
    async exec(command: string): Promise<SshExecResult> {
      execCalls.push(command);
      const queued = execQueue.shift();
      if (queued === undefined) {
        return { exitCode: 0, stderr: '', stdout: '' };
      }
      if (queued instanceof Error) {
        throw queued;
      }

      return queued;
    },
    async runInLoginShell(command: string): Promise<void> {
      loginShellCalls.push(command);
      if (state.nextLoginShellFailure !== null) {
        const failure = state.nextLoginShellFailure;
        state.nextLoginShellFailure = null;
        throw failure;
      }
    },

    async readDir(params: { path: string }): Promise<SshRemoteDirEntry[]> {
      readDirCalls.push({ path: params.path });
      const queued = readDirQueue.shift();
      if (queued === undefined) {
        return [];
      }
      if (queued instanceof Error) {
        throw queued;
      }

      return queued;
    },

    async write(data: string): Promise<void> {
      written.push(data);
    },
    async resize(cols: number, rows: number): Promise<void> {
      resizes.push({ cols, rows });
    },
    disconnect(): void {
      state.disconnectCount += 1;
    },
    addListener<E extends SshBridgeEventName>(
      eventName: E,
      listener: SshBridgeNativeEvents[E]
    ): { remove: () => void } {
      const unsubscribe = subscribe(eventName, listener);
      return { remove: unsubscribe };
    },
    removeListeners(): void {
      dataListeners.clear();
      closedListeners.clear();
      errorListeners.clear();
    },
    deferNextExec(): MockExecControls {
      const deferred: MockExecControls = {
        reject: (): void => {
          return;
        },
        resolve: (): void => {
          return;
        },
      };
      execQueue.push(
        new Promise<SshExecResult>((resolve, reject) => {
          deferred.resolve = resolve;
          deferred.reject = reject;
        })
      );

      return deferred;
    },
    queueExecResult(result: SshExecResult | Error): void {
      execQueue.push(result);
    },
    queueReadDirEntries(entries: SshRemoteDirEntry[] | Error): void {
      readDirQueue.push(entries);
    },
    failNextConnect(failure: MockConnectFailure): void {
      state.nextFailure = failure;
    },
    failNextLoginShell(error: Error): void {
      state.nextLoginShellFailure = error;
    },
    emitData(chunk: string): void {
      dataListeners.forEach((listener) => {
        listener({ value: chunk });
      });
    },
    emitClosed(reason: string): void {
      closedListeners.forEach((listener) => {
        listener({ reason });
      });
    },
    emitError(event: SshBridgeEventError): void {
      errorListeners.forEach((listener) => {
        listener(event);
      });
    },
  };
};
