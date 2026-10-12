# Command history

How Relay keeps the commands it types on your behalf out of the remote shell's history. This page is the implementation record; the same mechanism was first built for [Tmux Companion](https://github.com/beecode-rs/tmux-companion), whose [command history doc](https://github.com/beecode-rs/tmux-companion/blob/main/resource/docs/command-history.md) describes the shared reasoning.

## The problem

Anything an app *types into an interactive shell* becomes shell history. Relay used to leave these lines behind on every connect and session-list refresh:

```
PATH=/home/linuxbrew/.linuxbrew/bin:...; relay_tmux_exe=$(readlink "/proc/$(pgrep ...)"); ... > "$HOME/.cmh-tmux-sessions"
echo __cmh_shell_"done"__
tmux attach-session -t my-session 2>/dev/null || tmux attach-session 2>/dev/null || tmux new-session -A -s s01 -c '/Users/milos'
```

The fix has two halves: prefer channels that never touch an interactive shell at all, and make the few commands that must be typed invisible to history.

## What is already history-free

Everything Relay does over an SSH **exec channel** or **SFTP** never passes through an interactive shell's line editor, so it can never be recorded:

- the tmux probe, session-list read-back, focus/detach/scroll scripts, and session-path reads (`Ssh2ShellClientBase.exec`)
- kill/rename/create session one-shots (moved onto exec by this change — they need no interactivity)
- remote directory browsing (SFTP `readDir`)

This is an invariant to preserve: **new tmux communication must be a non-interactive exec unless interactivity is genuinely required.**

## The one typed exception that stays: session listing

`TerminalSession.listTmuxSessions` still types `loginListScript` into a fresh login shell. That is deliberate: the listing must reflect what the *interactive* shell's `tmux attach` will see — the login environment's `TMPDIR`/`TMUX_TMPDIR` decides which tmux socket exists, and the recorded `tmuxenv …` diagnostics explain a "no server" result in those terms. Running it on the exec channel could list a different socket than the one attach reaches.

## The mechanism: leading space + enable line

A command whose first character is a space is skipped by history in every mainstream shell — *if* the shell is configured to do so:

| Shell | Needs enabling | Enable line (sent first, itself space-prefixed) |
| --- | --- | --- |
| zsh (macOS default) | yes — `HIST_IGNORE_SPACE` is off by default | ` setopt HIST_IGNORE_SPACE` |
| bash | yes — `HISTCONTROL` must contain `ignorespace` | ` HISTCONTROL=ignorespace${HISTCONTROL:+:$HISTCONTROL}` (appends, never clobbers) |
| fish | **no** — fish ignores space-prefixed commands by default | *(none)* |
| unknown | never send shell-specific syntax we haven't verified | *(none)* |

Two semantics shaped the design:

- **The option is consulted when the line is accepted, before the command runs.** An inline `setopt HIST_IGNORE_SPACE; tmux …` on a single line does not protect that line. The enable step must be its own typed line preceding the command.
- **Every fresh shell records one enable line.** The enable line cannot be protected by an option that is not on yet. In Relay that means one ` setopt HIST_IGNORE_SPACE` (or `HISTCONTROL` assignment) per `listTmuxSessions` call — each opens a fresh login shell — and one per connection for the visible terminal. That is the mechanism's one unavoidable history trace; everything after it is skipped, and no existing history entry is ever erased.

Where each typed surface is wrapped (`src/services/ssh/shell-history-util.ts`):

- **`runInLoginShell` payload** — `ssh2-shell-client-base.ts` builds `[enableLine?, ' <command>', ' echo __cmh_shell_"done"__', ' exit']`, so any future caller gets history safety automatically. The `__cmh_shell_done__` sentinel is unaffected: the typed-back echo contains `__cmh_shell_"done"__` (quoted), which never matched the bare sentinel even before.
- **Interactive terminal lines** — `TerminalSession` types the enable line right after connect (before the auto-attach, awaited so PTY input ordering holds), then space-prefixes the auto-attach chain, the focus-detach re-attach, and the tmux install command the user confirms in the alert.

Leading space is semantically harmless: shells accept leading whitespace before assignments and commands, including `sudo`.

## Shell detection on connection

`Ssh2ShellClientBase.detectLoginShell()` runs `sh -c 'printf %s "$SHELL"'` on the exec channel — non-interactive, so the probe itself adds no history. `sh -c` shields it from rc files, and `$SHELL` on an exec channel is the passwd shell: the same shell `client.shell()` launches. The result is memoized per connection (failed probes resolve `unknown` and clear the memo so a later call retries). Detection covers zsh/bash/fish; anything else (`/bin/sh`, empty) is `unknown` and gets space-prefixed lines only.

## Known limitations

- **One enable line per fresh shell session** (per session-list refresh, per connection) is recorded, as described above.
- **List vs act socket divergence**: listing runs in the login shell's environment while kill/rename/create/focus/detach/scroll run on the exec channel's default socket. On machines that set a custom `TMUX_TMPDIR` only in login rc files these can disagree — the same divergence focus/detach already had. Exit codes from the exec channel are now checked, so failures surface instead of silently succeeding.
- **fish login shells**: fish needs no enable line, but the POSIX `PATH=…` prelude (`constant.tmux.pathPrelude`) is not valid fish syntax, so `loginListScript` and the auto-attach chain already misbehave there today. That preexisting breakage is out of scope here; kill/rename/create now work on fish because they moved into `sh -c` on the exec channel.
- **Single quotes in session names** remain unsupported inside `sh -c`-wrapped scripts — `_toShellWordForShC` re-escapes what it can, but names with apostrophes predate this change (`toFocusScript` had the same hole; it now uses the same escaping).

## Tests

- `src/services/ssh/shell-history-util.test.ts` — detection parsing per shell (including empty `$SHELL` and `/bin/sh`), exact enable lines, bash append-not-clobber, payload shapes per shell.
- `src/services/ssh/ssh2-shell-client.test.ts` — exact typed payload per shell, exec-probe-before-typing, memoized detection, sentinel resolution unchanged.
- `src/services/terminal/terminal-session.test.ts` — enable line typed before the auto-attach, space-prefixed attach writes, kill/rename/create/clone over exec with exit-code checks.
- `src/services/terminal/tmux-attach.test.ts` — `sh -c` wrapping and quote round-tripping for the exec builders.
