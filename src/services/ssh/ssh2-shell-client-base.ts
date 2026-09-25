import { Buffer } from 'buffer';
import { Client, type ClientChannel, type ConnectConfig, type FileEntryWithStats, type SFTPWrapper } from 'ssh2';

import { constant } from '@/constants/constant';
import { ssh2Debug } from '@/lib/ssh2-debug';
import { hostKeyLineUtil } from '@/services/ssh/host-key-line';
import type {
  SshBridgeError,
  SshBridgeErrorCode,
  SshBridgeEventClosed,
  SshBridgeEventData,
  SshBridgeEventError,
  SshBridgeEventName,
  SshBridgeEventSubscription,
  SshBridgeNativeEvents,
  SshConnectOptions,
  SshExecResult,
  SshRemoteDirEntry,
} from '@/services/terminal/ssh-terminal-types';

const AUTH_FAILURE_PATTERNS = ['authentication', 'auth methods failed', 'private key', 'privatekey', 'password'];
const EXEC_TIMEOUT_MS = 10000;
const LOGIN_SHELL_DONE_ECHO = 'echo __cmh_shell_"done"__';
const LOGIN_SHELL_DONE_SENTINEL = '__cmh_shell_done__';
const LOGIN_SHELL_TIMEOUT_MS = 20000;
const READ_DIR_TIMEOUT_MS = 10000;
const SFTP_TIMEOUT_MS = 10000;
const NETWORK_FAILURE_PATTERNS = ['econnrefused', 'enotfound', 'ehostunreachable', 'econnreset', 'epipe', 'network'];
const TIMEOUT_FAILURE_PATTERNS = ['timed out', 'timeout', 'etimedout'];
const KEEPALIVE_COUNT_MAX = 3;
const KEEPALIVE_INTERVAL_MS = 15000;
const READY_TIMEOUT_MS = 20000;
const TERMINAL_TYPE = 'xterm-256color';

type HostKeyRejection = {
  code: 'host-key-changed' | 'host-key-unknown';
  fingerprint: string;
  hostKeyLine: string;
};

type ClientPhase = 'connected' | 'connecting' | 'idle';

export class Ssh2ShellClientBase {
  protected readonly _closedListeners = new Set<(event: SshBridgeEventClosed) => void>();
  protected readonly _dataListeners = new Set<(event: SshBridgeEventData) => void>();
  protected readonly _errorListeners = new Set<(event: SshBridgeEventError) => void>();
  protected _channel: ClientChannel | null = null;
  protected _client: Client | null = null;
  protected _hostKeyRejection: HostKeyRejection | null = null;
  protected _phase: ClientPhase = 'idle';
  protected _sftpSessionPromise: Promise<SFTPWrapper> | null = null;
  protected _textDecoder = new TextDecoder();

  get isSupported(): boolean {
    return true;
  }

  async connect(options: SshConnectOptions): Promise<void> {
    if (this._phase !== 'idle') {
      throw new Error('SSH connection is already in progress or established');
    }
    this._phase = 'connecting';
    this._hostKeyRejection = null;
    this._textDecoder = new TextDecoder();
    try {
      await this._connectOnce(options);
      this._phase = 'connected';
    } catch (err) {
      this._phase = 'idle';
      this._teardownClient();
      throw err;
    }
  }

  async write(data: string): Promise<void> {
    if (typeof data !== 'string') {
      throw new Error('data must be a string');
    }
    if (this._channel === null) {
      throw new Error('SSH connection is not established');
    }
    await this._writeToChannel({ channel: this._channel, data });
  }

  async exec(command: string): Promise<SshExecResult> {
    if (this._client === null) {
      throw new Error('SSH connection is not established');
    }
    return this._execOnClient({ client: this._client, command });
  }

  async runInLoginShell(command: string): Promise<void> {
    if (this._client === null) {
      throw new Error('SSH connection is not established');
    }
    return this._runInLoginShellOnClient({ client: this._client, command });
  }

  async readDir(params: { path: string }): Promise<SshRemoteDirEntry[]> {
    if (this._client === null) {
      throw new Error('SSH connection is not established');
    }
    const sftp = await this._getSftpSession();
    const entries = await this._readdirEntries({ path: params.path, sftp });

    return entries
      .filter((entry) => {
        return entry.filename !== '.' && entry.filename !== '..';
      })
      .map((entry) => {
        return { isDirectory: entry.attrs.isDirectory(), name: entry.filename };
      });
  }

  async resize(cols: number, rows: number): Promise<void> {
    if (this._channel === null) {
      return;
    }
    await this._resizeChannel({ channel: this._channel, cols, rows });
  }

  disconnect(): void {
    this._teardownClient();
  }

  addListener<E extends SshBridgeEventName>(
    eventName: E,
    listener: SshBridgeNativeEvents[E]
  ): SshBridgeEventSubscription {
    if (eventName === 'data') {
      return this._addListener(this._dataListeners, listener as (event: SshBridgeEventData) => void);
    }
    if (eventName === 'closed') {
      return this._addListener(this._closedListeners, listener as (event: SshBridgeEventClosed) => void);
    }

    return this._addListener(this._errorListeners, listener as (event: SshBridgeEventError) => void);
  }

  removeListeners(): void {
    this._dataListeners.clear();
    this._closedListeners.clear();
    this._errorListeners.clear();
  }

  protected _addListener<T>(listeners: Set<T>, listener: T): SshBridgeEventSubscription {
    listeners.add(listener);

    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  }

  protected _connectOnce(options: SshConnectOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const client = new Client();
      this._client = client;
      client.on('error', (err: Error) => {
        this._onClientError({ client, err, reject });
      });
      client.once('close', () => {
        this._onClientClosed({ client, reject });
      });
      client.once('end', () => {
        this._onClientClosed({ client, reject });
      });
      client.once('ready', () => {
        void this._openShell({ client, options }).then(resolve, reject);
      });
      client.connect(this._toConnectConfig(options));
    });
  }

  protected _onClientError(params: { client: Client; err: Error; reject: (err: Error) => void }): void {
    ssh2Debug.logClientError({ error: params.err });
    if (this._client !== params.client) {
      return;
    }
    if (this._phase === 'connecting') {
      params.reject(this._toConnectError(params.err));

      return;
    }
    this._emitError(params.err);
  }

  protected _onClientClosed(params: { client: Client; reject: (err: Error) => void }): void {
    if (this._client !== params.client) {
      return;
    }
    if (this._phase === 'connecting') {
      params.reject(new Error('Connection closed before the SSH session was established'));

      return;
    }
    this._teardownClient();
    this._emitClosed('disconnected');
  }

  protected _openShell(params: { client: Client; options: SshConnectOptions }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { cols, rows } = params.options;
      params.client.shell({ cols, rows, term: TERMINAL_TYPE }, (err, channel) => {
        if (err) {
          reject(this._toConnectError(err));

          return;
        }
        if (this._client !== params.client) {
          channel.close();
          reject(new Error('Connection attempt was cancelled'));

          return;
        }
        this._channel = channel;
        channel.on('data', (chunk: Buffer) => {
          this._emitData(chunk);
        });
        channel.stderr.on('data', (chunk: Buffer) => {
          this._emitData(chunk);
        });
        channel.on('close', () => {
          this._onChannelClosed({ channel });
        });
        resolve();
      });
    });
  }

  protected _onChannelClosed(params: { channel: ClientChannel }): void {
    if (this._channel !== params.channel) {
      return;
    }
    this._teardownClient();
    this._emitClosed('eof');
  }

  protected _toConnectConfig(options: SshConnectOptions): ConnectConfig {
    return {
      debug: ssh2Debug.toDebugLogger(),
      host: options.host,
      hostVerifier: (key: Buffer, verify: (isValid: boolean) => void) => {
        this._verifyHostKey({ key, options, verify });
      },
      keepaliveCountMax: KEEPALIVE_COUNT_MAX,
      keepaliveInterval: KEEPALIVE_INTERVAL_MS,
      passphrase: options.auth.kind === 'privateKey' ? options.auth.passphrase : undefined,
      password: options.auth.kind === 'password' ? options.auth.password : undefined,
      port: options.port,
      privateKey: options.auth.kind === 'privateKey' ? options.auth.privateKey : undefined,
      readyTimeout: READY_TIMEOUT_MS,
      username: options.username,
    };
  }

  protected _verifyHostKey(params: {
    key: Buffer;
    options: SshConnectOptions;
    verify: (isValid: boolean) => void;
  }): void {
    const decision = hostKeyLineUtil.verify({
      acceptedHostKeys: params.options.acceptedHostKeys,
      hostToken: hostKeyLineUtil.toHostToken({ host: params.options.host, port: params.options.port }),
      key: params.key,
    });
    if (decision.isValid) {
      params.verify(true);

      return;
    }
    this._hostKeyRejection = {
      code: decision.code,
      fingerprint: decision.fingerprint,
      hostKeyLine: decision.hostKeyLine,
    };
    params.verify(false);
  }

  protected _toConnectError(err: unknown): SshBridgeError {
    const rejection = this._hostKeyRejection;
    const message = err instanceof Error ? err.message : String(err);
    if (rejection !== null) {
      return this._toSshError({
        code: rejection.code,
        fingerprint: rejection.fingerprint,
        hostKeyLine: rejection.hostKeyLine,
        message,
      });
    }

    return this._toSshError({ code: this._classifyErrorCode(message), message });
  }

  protected _classifyErrorCode(message: string): SshBridgeErrorCode {
    const lowered = message.toLowerCase();
    if (AUTH_FAILURE_PATTERNS.some((pattern) => {
      return lowered.includes(pattern);
    })) {
      return 'auth';
    }
    if (TIMEOUT_FAILURE_PATTERNS.some((pattern) => {
      return lowered.includes(pattern);
    })) {
      return 'timeout';
    }
    if (NETWORK_FAILURE_PATTERNS.some((pattern) => {
      return lowered.includes(pattern);
    })) {
      return 'network';
    }

    return 'unknown';
  }

  protected _toSshError(params: {
    code: SshBridgeErrorCode;
    fingerprint?: string;
    hostKeyLine?: string;
    message: string;
  }): SshBridgeError {
    const error = new Error(params.message) as SshBridgeError;
    error.code = params.code;
    if (params.fingerprint !== undefined) {
      error.fingerprint = params.fingerprint;
    }
    if (params.hostKeyLine !== undefined) {
      error.hostKeyLine = params.hostKeyLine;
    }

    return error;
  }

  protected _writeToChannel(params: { channel: ClientChannel; data: string }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      params.channel.write(params.data, (err) => {
        if (err) {
          reject(err);

          return;
        }
        resolve();
      });
    });
  }

  protected _execOnClient(params: { client: Client; command: string }): Promise<SshExecResult> {
    return new Promise<SshExecResult>((resolve, reject) => {
      const stdoutDecoder = new TextDecoder();
      const stderrDecoder = new TextDecoder();
      const run = {
        channel: null as ClientChannel | null,
        exitCode: null as number | null,
        isSettled: false,
        stderr: '',
        stdout: '',
      };
      const settleOnce = (settle: () => void) => {
        if (run.isSettled) {
          return;
        }
        run.isSettled = true;
        clearTimeout(timeout);
        settle();
      };
      const timeout = setTimeout(() => {
        settleOnce(() => {
          if (run.channel !== null && !run.channel.closed) {
            run.channel.close();
          }
          reject(new Error(`Remote command timed out after ${EXEC_TIMEOUT_MS}ms`));
        });
      }, EXEC_TIMEOUT_MS);
      params.client.exec(params.command, (err, execChannel) => {
        if (err) {
          settleOnce(() => {
            reject(err instanceof Error ? err : new Error(String(err)));
          });

          return;
        }
        if (this._client !== params.client) {
          settleOnce(() => {
            execChannel.close();
            reject(new Error('Connection attempt was cancelled'));
          });

          return;
        }
        run.channel = execChannel;
        execChannel.on('data', (chunk: Buffer) => {
          run.stdout += stdoutDecoder.decode(chunk, { stream: true });
        });
        execChannel.stderr.on('data', (chunk: Buffer) => {
          run.stderr += stderrDecoder.decode(chunk, { stream: true });
        });
        execChannel.once('exit', (code: number | null) => {
          run.exitCode = typeof code === 'number' ? code : null;
        });
        execChannel.once('close', () => {
          settleOnce(() => {
            if (this._client !== params.client) {
              reject(new Error('Connection attempt was cancelled'));

              return;
            }
            resolve({
              stdout: run.stdout + stdoutDecoder.decode(),
              stderr: run.stderr + stderrDecoder.decode(),
              exitCode: run.exitCode,
            });
          });
        });
      });
    });
  }

  protected _runInLoginShellOnClient(params: { client: Client; command: string }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const outputDecoder = new TextDecoder();
      const run = {
        channel: null as ClientChannel | null,
        isSettled: false,
        output: '',
      };
      const settleOnce = (settle: () => void) => {
        if (run.isSettled) {
          return;
        }
        run.isSettled = true;
        clearTimeout(timeout);
        settle();
      };
      const settleWithClose = (settle: () => void) => {
        settleOnce(() => {
          if (this._client !== params.client) {
            reject(new Error('Connection attempt was cancelled'));

            return;
          }
          settle();
        });
      };
      const timeout = setTimeout(() => {
        settleOnce(() => {
          if (run.channel !== null && !run.channel.closed) {
            run.channel.close();
          }
          reject(new Error(`Remote login shell timed out after ${LOGIN_SHELL_TIMEOUT_MS}ms`));
        });
      }, LOGIN_SHELL_TIMEOUT_MS);
      params.client.shell({ ...constant.terminal.initialSize, term: TERMINAL_TYPE }, (err, shellChannel) => {
        if (err) {
          settleOnce(() => {
            reject(err instanceof Error ? err : new Error(String(err)));
          });

          return;
        }
        if (this._client !== params.client) {
          settleOnce(() => {
            shellChannel.close();
            reject(new Error('Connection attempt was cancelled'));
          });

          return;
        }
        run.channel = shellChannel;
        shellChannel.on('data', (chunk: Buffer) => {
          run.output += outputDecoder.decode(chunk, { stream: true });
          if (!run.output.includes(LOGIN_SHELL_DONE_SENTINEL)) {
            return;
          }
          settleWithClose(() => {
            resolve();
          });
          if (!shellChannel.closed) {
            shellChannel.close();
          }
        });
        shellChannel.once('close', () => {
          settleWithClose(() => {
            resolve();
          });
        });
        shellChannel.write(`${params.command}\r${LOGIN_SHELL_DONE_ECHO}\rexit\r`, (writeError) => {
          if (writeError) {
            settleOnce(() => {
              reject(writeError);
            });
          }
        });
      });
    });
  }

  protected _getSftpSession(): Promise<SFTPWrapper> {
    if (this._sftpSessionPromise !== null) {
      return this._sftpSessionPromise;
    }
    const sessionPromise = this._createSftpSession();
    void sessionPromise.catch(() => {
      this._sftpSessionPromise = null;
    });
    this._sftpSessionPromise = sessionPromise;

    return sessionPromise;
  }

  protected _createSftpSession(): Promise<SFTPWrapper> {
    return new Promise<SFTPWrapper>((resolve, reject) => {
      const client = this._client;
      if (client === null) {
        reject(new Error('SSH connection is not established'));

        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error(`SFTP session timed out after ${SFTP_TIMEOUT_MS}ms`));
      }, SFTP_TIMEOUT_MS);
      client.sftp((err, sftpSession) => {
        clearTimeout(timeout);
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));

          return;
        }
        sftpSession.on('close', () => {
          this._sftpSessionPromise = null;
        });
        resolve(sftpSession);
      });
    });
  }

  protected _readdirEntries(params: { path: string; sftp: SFTPWrapper }): Promise<FileEntryWithStats[]> {
    return new Promise<FileEntryWithStats[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Remote directory listing timed out after ${READ_DIR_TIMEOUT_MS}ms`));
      }, READ_DIR_TIMEOUT_MS);
      params.sftp.readdir(params.path, (err, list) => {
        clearTimeout(timeout);
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));

          return;
        }
        resolve(list);
      });
    });
  }

  protected _resizeChannel(params: { channel: ClientChannel; cols: number; rows: number }): Promise<void> {
    params.channel.setWindow(params.rows, params.cols, 0, 0);

    return Promise.resolve();
  }

  protected _teardownClient(): void {
    const channel = this._channel;
    const client = this._client;
    this._client = null;
    this._channel = null;
    this._phase = 'idle';
    this._sftpSessionPromise = null;
    if (channel !== null && !channel.closed) {
      channel.close();
    }
    if (client !== null) {
      try {
        client.end();
      } catch (err) {
        ssh2Debug.logClientError({ error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  }

  protected _emitData(chunk: Buffer): void {
    const value = this._textDecoder.decode(chunk, { stream: true });
    if (value === '') {
      return;
    }
    Array.from(this._dataListeners).forEach((listener) => {
      listener({ value });
    });
  }

  protected _emitClosed(reason: string): void {
    Array.from(this._closedListeners).forEach((listener) => {
      listener({ reason });
    });
  }

  protected _emitError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const event = { code: this._classifyErrorCode(message), message };
    Array.from(this._errorListeners).forEach((listener) => {
      listener(event);
    });
  }
}
