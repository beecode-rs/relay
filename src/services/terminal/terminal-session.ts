import { constant } from '@/constants/constant';
import { CursorModeTracker } from '@/services/terminal/cursor-mode-tracker';
import { keySequences } from '@/services/terminal/key-sequences';
import { OutputBatcher } from '@/services/terminal/output-batcher';
import { remoteBrowseUtil } from '@/services/terminal/remote-browse';
import { sshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import type { SshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import { tmuxAttachUtil } from '@/services/terminal/tmux-attach';
import { tmuxCheckUtil } from '@/services/terminal/tmux-check';
import type { TmuxListOutcome } from '@/services/terminal/tmux-check';
import { createTerminalEmulator } from '@/services/terminal/terminal-emulator';
import type { TerminalEmulator } from '@/services/terminal/terminal-emulator';
import type { TerminalSnapshot } from '@/services/terminal/terminal-serializer';
import type {
  SshBridgeError,
  SshBridgeEventError,
  SshBridgeEventSubscription,
  SshConnectOptions,
} from '@/services/terminal/ssh-terminal-types';

export type TerminalSessionStatus =
  | 'idle'
  | 'connecting'
  | 'host-key-unknown'
  | 'host-key-changed'
  | 'connected'
  | 'closed'
  | 'error';

export type PendingHostKey = { fingerprint: string; hostKeyLine: string };

export type TmuxPrompt = { installCommand: string | null };

export type TmuxSessionListResult =
  | { kind: 'sessions'; currentSessionName: string | null; sessionNames: string[] }
  | { kind: 'error'; message: string };

export type TerminalSessionState = {
  status: TerminalSessionStatus;
  error?: { code: string; message: string };
  pendingHostKey?: PendingHostKey;
  tmuxPrompt?: TmuxPrompt;
};

export type TerminalSessionListener = (state: TerminalSessionState) => void;

export type TerminalEmulatorFactory = (params: { cols: number; rows: number }) => TerminalEmulator;

const TMUX_SCROLL_FLUSH_DELAY_MS = 120;
const ACTIVE_STATUSES: readonly TerminalSessionStatus[] = [
  'connecting',
  'connected',
  'host-key-unknown',
  'host-key-changed',
];

const hostTokenOf = (hostKeyLine: string): string => {
  return hostKeyLine.split(/\s+/)[0] ?? '';
};

const mergeHostKeyLine = (acceptedHostKeys: string[], hostKeyLine: string): string[] => {
  const hostToken = hostTokenOf(hostKeyLine);
  const otherHosts = acceptedHostKeys.filter((line) => {
    return hostTokenOf(line) !== hostToken;
  });
  return [...otherHosts, hostKeyLine];
};

export class TerminalSession {
  private state: TerminalSessionState = { status: 'idle' };
  private readonly listeners = new Set<TerminalSessionListener>();
  private readonly port: SshTerminalPort;
  private readonly createEmulator: TerminalEmulatorFactory;
  private readonly cursorTracker = new CursorModeTracker();
  private readonly batcher = new OutputBatcher();
  private portSubscriptions: SshBridgeEventSubscription[] = [];
  private emulator: TerminalEmulator | null = null;
  private profile: SshConnectOptions | null = null;
  private size: { cols: number; rows: number } = constant.terminal.initialSize;
  private connectionAttemptActive = false;
  private tmuxCheckSeq = 0;
  private tmuxAutoAttach: Promise<void> = Promise.resolve();
  private isTmuxAttached = false;
  private pendingTmuxScrollRows = 0;
  private isTmuxScrollFlushScheduled = false;

  constructor(params: { port?: SshTerminalPort; createEmulator?: TerminalEmulatorFactory }) {
    this.port = params.port ?? sshTerminalPort;
    this.createEmulator = params.createEmulator ?? createTerminalEmulator;
  }

  get status(): TerminalSessionStatus {
    return this.state.status;
  }

  get currentState(): TerminalSessionState {
    return { ...this.state };
  }

  get isApplicationCursorKeys(): boolean {
    return this.cursorTracker.isApplicationCursorKeys;
  }

  get isMouseTrackingEnabled(): boolean {
    return this.emulator?.isMouseTrackingEnabled ?? false;
  }

  get isRemoteScrollEnabled(): boolean {
    return this.isTmuxAttached || this.isMouseTrackingEnabled;
  }

  scrollRows(params: { rows: number }): void {
    if (this.emulator === null || params.rows === 0) {
      return;
    }
    if (this.emulator.isMouseTrackingEnabled) {
      this.writeKeyScrollRows({ isMouseTrackingEnabled: true, rows: params.rows });
      return;
    }
    if (this.isTmuxAttached) {
      this.queueTmuxScrollRows(params.rows);
      return;
    }
    this.writeKeyScrollRows({ isMouseTrackingEnabled: false, rows: params.rows });
  }

  private writeKeyScrollRows(params: { isMouseTrackingEnabled: boolean; rows: number }): void {
    if (this.emulator === null) {
      return;
    }
    const snapshot = this.emulator.snapshotRows();
    this.write(
      keySequences.scrollSequence({
        isApplicationCursorKeys: this.cursorTracker.isApplicationCursorKeys,
        isMouseTrackingEnabled: params.isMouseTrackingEnabled,
        rows: params.rows,
        x: snapshot.cursor.x,
        y: snapshot.cursor.y,
      })
    );
  }

  private queueTmuxScrollRows(rows: number): void {
    this.pendingTmuxScrollRows += rows;
    if (this.isTmuxScrollFlushScheduled) {
      return;
    }
    this.isTmuxScrollFlushScheduled = true;
    setTimeout(() => {
      this.isTmuxScrollFlushScheduled = false;
      void this.flushTmuxScrollRows();
    }, TMUX_SCROLL_FLUSH_DELAY_MS);
  }

  private async flushTmuxScrollRows(): Promise<void> {
    while (this.pendingTmuxScrollRows !== 0 && this.state.status === 'connected') {
      const rows = this.pendingTmuxScrollRows;
      this.pendingTmuxScrollRows = 0;
      try {
        await this.port.exec(tmuxAttachUtil.toScrollScript({ rows }));
      } catch {
        return;
      }
    }
  }

  isActiveFor(profile: SshConnectOptions): boolean {
    if (this.profile === null || !ACTIVE_STATUSES.includes(this.state.status)) {
      return false;
    }
    return (
      this.profile.host === profile.host &&
      this.profile.port === profile.port &&
      this.profile.username === profile.username
    );
  }

  subscribe(listener: TerminalSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(profile: SshConnectOptions, size?: { cols: number; rows: number }): Promise<void> {
    this.profile = profile;
    this.size = size ?? this.size;
    this.teardownConnection();
    this.cursorTracker.reset();
    this.batcher.clear();
    this.isTmuxAttached = false;
    this.pendingTmuxScrollRows = 0;
    this.emulator = this.createEmulator(this.size);
    this.updateState({ status: 'connecting' });
    this.connectionAttemptActive = true;
    this.portSubscriptions = [
      this.port.addListener('data', (event) => {
        this.handleData(event.value);
      }),
      this.port.addListener('closed', () => {
        this.handleClosed();
      }),
      this.port.addListener('error', (event) => {
        this.handlePortError(event);
      }),
    ];
    try {
      await this.port.connect({ ...profile, cols: this.size.cols, rows: this.size.rows });
      this.tmuxAutoAttach = this.checkTmux();
      this.updateState({ status: 'connected' });
    } catch (error) {
      this.handleConnectFailure(error);
    }
  }

  acceptHostKey(): void {
    const pendingHostKey = this.state.pendingHostKey;
    if (this.profile === null || pendingHostKey === undefined) {
      return;
    }
    this.profile = {
      ...this.profile,
      acceptedHostKeys: mergeHostKeyLine(this.profile.acceptedHostKeys, pendingHostKey.hostKeyLine),
    };
    const profile = this.profile;
    void this.start(profile);
  }

  rejectHostKey(): void {
    if (this.state.pendingHostKey === undefined) {
      return;
    }
    this.updateState({
      status: 'error',
      error: { code: 'host-key-rejected', message: 'Host key was rejected' },
    });
  }

  dismissTmuxPrompt(): void {
    if (this.state.tmuxPrompt === undefined) {
      return;
    }
    const { error, pendingHostKey, status } = this.state;
    this.updateState({ error, pendingHostKey, status });
  }

  async listTmuxSessions(): Promise<TmuxSessionListResult> {
    // Wait out the on-connect auto-attach: bumping tmuxCheckSeq while its probe
    // is still in flight cancels the attach, and listing earlier reads
    // pre-attach tmux state (stale clients from dropped connections).
    await this.tmuxAutoAttach;
    const seq = ++this.tmuxCheckSeq;
    if (this.state.status !== 'connected') {
      return { kind: 'sessions', currentSessionName: null, sessionNames: [] };
    }
    try {
      await this.port.runInLoginShell(tmuxCheckUtil.loginListScript);
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return { kind: 'sessions', currentSessionName: null, sessionNames: [] };
      }
      const result = await this.port.exec(tmuxCheckUtil.readListScript);
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return { kind: 'sessions', currentSessionName: null, sessionNames: [] };
      }

      return this.toTmuxListResult({
        outcome: tmuxCheckUtil.parseListOutcome({
          stdout: result.stdout,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return { kind: 'error', message: `Could not list tmux sessions: ${message}` };
    }
  }

  async killTmuxSession(params: { sessionName: string }): Promise<boolean> {
    const seq = ++this.tmuxCheckSeq;
    if (this.state.status !== 'connected') {
      return false;
    }
    try {
      await this.port.runInLoginShell(tmuxAttachUtil.toKillSessionCommand({ sessionName: params.sessionName }));
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async renameTmuxSession(params: { nextSessionName: string; sessionName: string }): Promise<boolean> {
    const seq = ++this.tmuxCheckSeq;
    if (this.state.status !== 'connected') {
      return false;
    }
    try {
      await this.port.runInLoginShell(
        tmuxAttachUtil.toRenameSessionCommand({
          nextSessionName: params.nextSessionName,
          sessionName: params.sessionName,
        })
      );
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async createTmuxSession(params: { sessionName: string; startPath?: string }): Promise<boolean> {
    const seq = ++this.tmuxCheckSeq;
    if (this.state.status !== 'connected') {
      return false;
    }
    try {
      await this.port.runInLoginShell(tmuxAttachUtil.toCreateSessionCommand(params));
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  // A clone is a new session started in the source session's working directory;
  // when the directory cannot be read the clone starts in the default location.
  async cloneTmuxSession(params: { nextSessionName: string; sessionName: string }): Promise<boolean> {
    const seq = ++this.tmuxCheckSeq;
    if (this.state.status !== 'connected') {
      return false;
    }
    let startPath: string | undefined;
    try {
      const result = await this.port.exec(tmuxAttachUtil.toSessionPathScript({ sessionName: params.sessionName }));
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return false;
      }
      startPath = tmuxAttachUtil.toSessionPathOf({ stdout: result.stdout }) ?? undefined;
    } catch {
      return false;
    }
    return this.createTmuxSession({ sessionName: params.nextSessionName, startPath });
  }

  async focusTmuxSession(params: { sessionName: string }): Promise<boolean> {
    if (this.state.status !== 'connected') {
      return false;
    }
    try {
      const result = await this.port.exec(
        tmuxAttachUtil.toFocusScript({
          sessionName: params.sessionName,
        })
      );
      if (this.state.status !== 'connected') {
        return false;
      }
      const outcome = tmuxAttachUtil.toFocusOutcome({ stdout: result.stdout });
      if (outcome.kind === 'unknown') {
        return false;
      }
      this.isTmuxAttached = true;
      if (outcome.kind === 'detached') {
        this.write(`${tmuxAttachUtil.toAttachSessionCommand({ sessionName: params.sessionName })}\r`);
      }

      return true;
    } catch {
      return false;
    }
  }

  async detachTmuxSession(): Promise<boolean> {
    if (this.state.status !== 'connected') {
      return false;
    }
    try {
      const result = await this.port.exec(tmuxAttachUtil.toDetachScript());
      if (this.state.status !== 'connected') {
        return false;
      }
      const outcome = tmuxAttachUtil.toDetachOutcome({ stdout: result.stdout });
      if (outcome.kind === 'detached') {
        this.isTmuxAttached = false;
      }

      return outcome.kind !== 'unknown';
    } catch {
      return false;
    }
  }

  async listRemoteDirectories(params: { path: string }): Promise<string[]> {
    if (this.state.status !== 'connected') {
      throw new Error('Terminal is not connected');
    }
    const entries = await this.port.readDir({ path: params.path });

    return remoteBrowseUtil.toSubdirectoryNames({ entries });
  }

  write(input: string): void {
    if (this.state.status !== 'connected') {
      return;
    }
    void this.port.write(input).catch(() => {
      return;
    });
  }

  resize(params: { cols: number; rows: number }): void {
    if (this.size.cols === params.cols && this.size.rows === params.rows) {
      return;
    }
    this.size = params;
    if (this.emulator !== null) {
      this.emulator.resize(params.cols, params.rows);
    }
    if (this.state.status === 'connected') {
      void this.port.resize(params.cols, params.rows).catch(() => {
        return;
      });
    }
  }

  end(): void {
    if (!this.connectionAttemptActive) {
      return;
    }
    this.teardownConnection();
    this.updateState({ status: 'closed' });
  }

  snapshot(): TerminalSnapshot {
    if (this.emulator === null) {
      return { rows: [], cursor: { x: 0, y: 0 }, firstLine: 0, isAlternateBuffer: false, viewportRowCount: 0 };
    }
    return this.emulator.snapshotRows();
  }

  drainPendingOutput(): string | null {
    return this.batcher.drain();
  }

  private toTmuxListResult(params: { outcome: TmuxListOutcome }): TmuxSessionListResult {
    if (params.outcome.kind === 'listed') {
      return {
        kind: 'sessions',
        currentSessionName: params.outcome.currentSessionName,
        sessionNames: params.outcome.sessionNames,
      };
    }
    if (params.outcome.kind === 'no-server') {
      return {
        kind: 'error',
        message: `Could not list tmux sessions: tmux in a fresh login shell sees no server (${params.outcome.envDetails})`,
      };
    }

    return {
      kind: 'error',
      message: 'Could not list tmux sessions: the login shell closed before the listing ran',
    };
  }

  private updateState(state: TerminalSessionState): void {
    this.state = state;
    this.listeners.forEach((listener) => {
      listener(this.state);
    });
  }

  private teardownConnection(): void {
    this.portSubscriptions.forEach((subscription) => {
      subscription.remove();
    });
    this.portSubscriptions = [];
    if (this.connectionAttemptActive) {
      this.connectionAttemptActive = false;
      this.port.disconnect();
    }
  }

  private handleData(chunk: string): void {
    this.cursorTracker.update(chunk);
    if (this.emulator !== null) {
      this.emulator.write(chunk);
    }
    this.batcher.enqueue(chunk);
  }

  private handleClosed(): void {
    this.connectionAttemptActive = false;
    this.updateState({ status: 'closed' });
  }

  private handlePortError(event: SshBridgeEventError): void {
    this.connectionAttemptActive = false;
    this.updateState({ status: 'error', error: { code: event.code, message: event.message } });
  }

  private handleConnectFailure(error: unknown): void {
    this.connectionAttemptActive = false;
    const bridgeError = error as Partial<SshBridgeError> | null | undefined;
    const code = bridgeError?.code ?? 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    const fingerprint = bridgeError?.fingerprint;
    const hostKeyLine = bridgeError?.hostKeyLine;
    const hasHostKeyPayload = fingerprint != null && hostKeyLine != null;
    if ((code === 'host-key-unknown' || code === 'host-key-changed') && hasHostKeyPayload) {
      this.updateState({
        status: code,
        pendingHostKey: { fingerprint, hostKeyLine },
      });
      return;
    }
    this.updateState({ status: 'error', error: { code, message } });
  }

  private async checkTmux(): Promise<void> {
    const seq = ++this.tmuxCheckSeq;
    try {
      const result = await this.port.exec(tmuxCheckUtil.probeScript);
      if (seq !== this.tmuxCheckSeq || this.state.status !== 'connected') {
        return;
      }
      const probe = tmuxCheckUtil.parse({ stdout: result.stdout });
      if (probe.tmuxStatus === 'present') {
        this.isTmuxAttached = true;
        this.write(
          `${tmuxAttachUtil.toCommand({
            preferredSessionName: this.profile?.lastTmuxSessionName,
            startPath: this.profile?.remotePath,
          })}\r`
        );
        return;
      }
      if (probe.tmuxStatus !== 'missing') {
        return;
      }
      this.updateState({
        ...this.state,
        tmuxPrompt: {
          installCommand: tmuxCheckUtil.toInstallCommand({
            isRoot: probe.uid === '0',
            packageManager: probe.packageManager,
          }),
        },
      });
    } catch {
      return;
    }
  }
}
