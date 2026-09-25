import { buildAuthorizedKeysInstallCommand } from '@/services/ssh/authorized-key-install';

const AUTHORIZED_KEYS_PATH = '"$HOME/.ssh/authorized_keys"';
const PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIUNITTESTBLOB beecode@ios-1a2b3c';
const KEY_BLOB = 'AAAAC3NzaC1lZDI1NTE5AAAAIUNITTESTBLOB';

const grepGuardOf = (command: string): string | undefined => {
  return command.match(/grep -qF '([^']*)'/)?.[1];
};

describe('buildAuthorizedKeysInstallCommand', () => {
  it('builds a single hardened install command', () => {
    const command = buildAuthorizedKeysInstallCommand(PUBLIC_KEY);

    expect(command).toContain('umask 077');
    expect(command).toContain('mkdir -p "$HOME/.ssh"');
    expect(command).toContain(`chmod 700 "$HOME/.ssh"`);
    expect(command).toContain(`chmod 600 ${AUTHORIZED_KEYS_PATH}`);
    expect(command).toContain('touch');
  });

  it('restores selinux contexts only when restorecon is available', () => {
    const command = buildAuthorizedKeysInstallCommand(PUBLIC_KEY);

    expect(command.indexOf('command -v restorecon')).toBeLessThan(command.indexOf('restorecon -F'));
    expect(command).toContain('|| true');
  });

  it('repairs a missing trailing newline before appending', () => {
    const command = buildAuthorizedKeysInstallCommand(PUBLIC_KEY);

    expect(command).toContain(`tail -c1 ${AUTHORIZED_KEYS_PATH}`);
    expect(command).toContain(`echo >> ${AUTHORIZED_KEYS_PATH}`);
  });

  it('appends the full public line behind a blob-only grep guard', () => {
    const command = buildAuthorizedKeysInstallCommand(PUBLIC_KEY);

    expect(command).toContain(`echo '${PUBLIC_KEY}' >> ${AUTHORIZED_KEYS_PATH}`);
    expect(grepGuardOf(command)).toBe(KEY_BLOB);
  });

  it('escapes single quotes in the public line', () => {
    const quotedKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIUNITTESTBLOB beecode@ios-o'brien";
    const command = buildAuthorizedKeysInstallCommand(quotedKey);

    expect(command).toContain(`echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIUNITTESTBLOB beecode@ios-o'\\''brien' >> ${AUTHORIZED_KEYS_PATH}`);
    expect(grepGuardOf(command)).toBe(KEY_BLOB);
  });

  it('normalizes whitespace in the public line before appending', () => {
    const command = buildAuthorizedKeysInstallCommand('  ssh-ed25519   AAAAC3NzaC1lZDI1NTE5AAAAIUNITTESTBLOB   beecode@ios-1a2b3c  ');

    expect(command).toContain(`echo '${PUBLIC_KEY}' >> ${AUTHORIZED_KEYS_PATH}`);
    expect(grepGuardOf(command)).toBe(KEY_BLOB);
  });
});
