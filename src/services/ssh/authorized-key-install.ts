const AUTHORIZED_KEYS_PATH = '"$HOME/.ssh/authorized_keys"';
const SSH_DIR_PATH = '"$HOME/.ssh"';

const toPublicKeyLine = (publicKey: string): string => {
  return publicKey.trim().split(/\s+/).join(' ');
};

const toKeyBlobOf = (publicLine: string): string => {
  const tokens = publicLine.split(' ');

  return tokens.length > 1 ? (tokens[1] ?? publicLine) : publicLine;
};

const toSingleQuoted = (value: string): string => {
  return `'${value.replace(/'/g, "'\\''")}'`;
};

export const buildAuthorizedKeysInstallCommand = (publicKey: string): string => {
  const publicLine = toPublicKeyLine(publicKey);
  const keyBlob = toKeyBlobOf(publicLine);

  return [
    'umask 077',
    `mkdir -p ${SSH_DIR_PATH}`,
    `touch ${AUTHORIZED_KEYS_PATH}`,
    `chmod 700 ${SSH_DIR_PATH}`,
    `chmod 600 ${AUTHORIZED_KEYS_PATH}`,
    `{ [ -z "$(tail -c1 ${AUTHORIZED_KEYS_PATH})" ] || echo >> ${AUTHORIZED_KEYS_PATH}; }`,
    `{ grep -qF ${toSingleQuoted(keyBlob)} ${AUTHORIZED_KEYS_PATH} || echo ${toSingleQuoted(publicLine)} >> ${AUTHORIZED_KEYS_PATH}; }`,
    `{ command -v restorecon >/dev/null 2>&1 && restorecon -F ${SSH_DIR_PATH} ${AUTHORIZED_KEYS_PATH} 2>/dev/null || true; }`,
  ].join(' && ');
};
