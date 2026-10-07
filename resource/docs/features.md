# Features

The detail behind the [README](../../README.md) feature list — settings, edge cases, and how each part of Relay behaves.

## Servers

<img src="../screenshots/add-new-instance.png" height="480" alt="Form for adding a new server" />

- Manage any number of SSH servers (host, port, username).
- Authentication per server: password, private key, or the device key.
- The server form has a one-shot **Test Connection** with host-key accept/reject.
- The form is keyboard-aware — it stays reachable above the keyboard.
- Older setups are migrated automatically from the legacy single-profile format.
- Credentials and known hosts are kept per profile; leaving the secret fields blank while editing a server keeps the stored values.

## Device SSH key

- Relay generates an SSH key on the device.
- The key can be installed onto a server straight from the server form.
- Settings lets you rename or regenerate the key.

## Host keys (TOFU)

- Host keys are verified trust-on-first-use: on first connect you are shown the key's SHA256 fingerprint and can accept or reject it.
- Accepted keys are stored as known_hosts-format lines.

## Terminal

<img src="../screenshots/terminal-screen.png" height="480" alt="Terminal running a remote shell" />

<img src="../screenshots/keyboard-with-extra-keys.png" height="480" alt="Keyboard with the extra keys row" />

<img src="../screenshots/keyboard-with-function-keys.png" height="480" alt="Keyboard with the function keys row" />

<img src="../screenshots/select-text-functionality.png" height="480" alt="Selecting text in the terminal" />

- Interactive `xterm-256color` PTY shell.
- Extra keys row: ESC/TAB/CTRL/ALT/arrows, plus an F1–F12 layer.
- Hidden-keyboard input — terminal input goes through a hidden input field, so keystrokes reach the remote shell directly.
- Live PTY resize, with the terminal padded above the keyboard.
- Adjustable font size: pinch to zoom, or pick a size in settings.
- Dedicated landscape layout.
- Text selection, with optional selection-follows-finger.
- Clean disconnect from the terminal's close action.
- Edge case: typing `exit` in a detached terminal session currently just restarts the session — it should close the terminal screen and go back to the server screen instead (see the planned list in the README).

## tmux sessions

<img src="../screenshots/side-menu-multi-sessions-multi-instances.png" height="480" alt="Side menu with multiple tmux sessions" />

- A sessions drawer to switch, create, rename, clone, and delete sessions.
- Long-running remote programs (e.g. Claude Code in tmux) survive disconnects.

## Settings

- Light/dark/system theming.
- Terminal preferences, including the font size.
- Device SSH key management (rename or regenerate).
- An about screen.

## Where secrets live

Passwords, private keys, and accepted host keys stay on the device, stored in the OS secure store (`expo-secure-store`), and are sent only to the server they belong to. The app has no analytics or telemetry dependencies.
