import { createSsh2ShellClient } from '@/services/ssh/ssh2-shell-client';
import { TerminalSession } from '@/services/terminal/terminal-session';
import type { SshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import type { SshConnectOptions } from '@/services/terminal/ssh-terminal-types';

export type TerminalSessionEntry = {
  profileId: string;
  connectOptions: SshConnectOptions;
  session: TerminalSession;
};

export type TerminalSessionRegistryListener = () => void;

/**
 * Tracks one TerminalSession per server profile so several servers can stay
 * connected at once. Each session owns its own SSH client via portFactory -
 * a single client only carries one connection.
 */
export class TerminalSessionRegistry {
  private readonly entries = new Map<string, TerminalSessionEntry>();
  private readonly listeners = new Set<TerminalSessionRegistryListener>();
  private readonly removalSubscriptions = new Map<string, () => void>();
  private readonly portFactory: () => SshTerminalPort;

  constructor(params: { portFactory?: () => SshTerminalPort } = {}) {
    this.portFactory = params.portFactory ?? createSsh2ShellClient;
  }

  subscribe(listener: TerminalSessionRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  list(): TerminalSessionEntry[] {
    return [...this.entries.values()];
  }

  find(profileId: string): TerminalSessionEntry | null {
    return this.entries.get(profileId) ?? null;
  }

  async ensureStarted(params: {
    profileId: string;
    connectOptions: SshConnectOptions;
  }): Promise<TerminalSessionEntry> {
    const existing = this.entries.get(params.profileId);
    if (existing !== undefined) {
      if (!existing.session.isActiveFor(params.connectOptions)) {
        await existing.session.start(params.connectOptions);
      }
      return existing;
    }

    const session = new TerminalSession({ port: this.portFactory() });
    const entry: TerminalSessionEntry = {
      profileId: params.profileId,
      connectOptions: params.connectOptions,
      session,
    };
    this.entries.set(params.profileId, entry);
    // A closed session (user disconnect or remote drop) leaves the connected
    // set; errored/host-key sessions stay so they can be reconnected.
    this.removalSubscriptions.set(
      params.profileId,
      session.subscribe((state) => {
        if (state.status === 'closed') {
          this.remove(params.profileId);
        }
      })
    );
    this.notify();
    await session.start(params.connectOptions);
    return entry;
  }

  disconnect(profileId: string): void {
    const entry = this.entries.get(profileId);
    if (entry === undefined) {
      return;
    }
    entry.session.end();
    this.remove(profileId);
  }

  remove(profileId: string): void {
    this.removalSubscriptions.get(profileId)?.();
    this.removalSubscriptions.delete(profileId);
    if (this.entries.delete(profileId)) {
      this.notify();
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const terminalSessionRegistry = new TerminalSessionRegistry();
