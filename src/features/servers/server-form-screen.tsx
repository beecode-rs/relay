import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { constant } from '@/constants/constant';
import { FolderBrowserModal } from '@/components/folder-browser-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { HostKeyDialog } from '@/features/connect/host-key-dialog';
import type { HostKeyDialogVariant } from '@/features/connect/host-key-dialog';
import { DeviceKeyInstallModal } from '@/features/servers/device-key-install-modal';
import type { InstallStatus, PendingHostKey } from '@/features/servers/device-key-install-modal';
import { useTheme } from '@/hooks/use-theme';
import type { ServerCredentialStore } from '@/services/connection/credential-store';
import { serverCredentialStore } from '@/services/connection/credential-store';
import type { DeviceKeyInfo } from '@/services/connection/device-key';
import { deviceKeyService } from '@/services/connection/device-key';
import type { ServerProfile, ServerProfileSecrets } from '@/services/connection/server-profile';
import {
  mergeAcceptedHostKey,
  serverProfileIdUtil,
  serverProfileTmuxUtil,
  serverProfileValidator,
} from '@/services/connection/server-profile';
import { serverProfileStore } from '@/services/connection/server-profile-store';
import type { ServerProfileStore } from '@/services/connection/server-profile-store';
import { buildAuthorizedKeysInstallCommand } from '@/services/ssh/authorized-key-install';
import { createSsh2ShellClient } from '@/services/ssh/ssh2-shell-client';
import { remoteBrowseUtil } from '@/services/terminal/remote-browse';
import { remotePathUtil } from '@/services/terminal/remote-path-util';
import type { SshTerminalPort } from '@/services/terminal/ssh-terminal-port';
import type {
  SshBridgeError,
  SshBridgeErrorCode,
  SshConnectOptions,
  SshExecResult,
} from '@/services/terminal/ssh-terminal-types';

export type ServerFormScreenProps = {
  profileId?: string;
  cloneSourceId?: string;
  store?: ServerProfileStore;
  credentialStore?: ServerCredentialStore;
  createTestClient?: () => SshTerminalPort;
};

type AuthKind = 'deviceKey' | 'password' | 'privateKey';

type ServerFormState = {
  label: string;
  host: string;
  portText: string;
  username: string;
  authKind: AuthKind;
  password: string;
  privateKey: string;
  passphrase: string;
  acceptedHostKeys: string[];
  tmuxPrefixText: string;
  remotePathText: string;
};

type TestStatus =
  | { kind: 'failed'; message: string; code: SshBridgeErrorCode }
  | { kind: 'idle' }
  | { kind: 'succeeded' }
  | { kind: 'testing' };


const emptyForm: ServerFormState = {
  label: '',
  host: '',
  portText: '',
  username: '',
  authKind: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  acceptedHostKeys: [],
  tmuxPrefixText: '',
  remotePathText: '',
};

const hasStoredSecretsFor = (
  authMethod: AuthKind,
  storedSecrets: ServerProfileSecrets
): boolean => {
  if (authMethod === 'deviceKey') {
    return true;
  }
  if (authMethod === 'password') {
    return typeof storedSecrets.password === 'string' && storedSecrets.password !== '';
  }

  return typeof storedSecrets.privateKey === 'string' && storedSecrets.privateKey !== '';
};

const parsePortOf = (form: ServerFormState): number | undefined => {
  const trimmed = form.portText.trim();
  if (trimmed === '') {
    return constant.server.defaultPort;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return undefined;
  }

  return parsed;
};

const toEnteredSecrets = (form: ServerFormState): ServerProfileSecrets => {
  if (form.authKind === 'deviceKey') {
    return {};
  }
  if (form.authKind === 'password') {
    return form.password === '' ? {} : { password: form.password };
  }
  const secrets: ServerProfileSecrets = form.privateKey === '' ? {} : { privateKey: form.privateKey };
  if (form.passphrase !== '') {
    return { ...secrets, passphrase: form.passphrase };
  }

  return secrets;
};

const toFormState = (profile: ServerProfile): ServerFormState => {
  return {
    label: profile.label,
    host: profile.host,
    portText: String(profile.port),
    username: profile.username,
    authKind: profile.authMethod,
    password: '',
    privateKey: '',
    passphrase: '',
    acceptedHostKeys: profile.acceptedHostKeys,
    tmuxPrefixText: profile.tmuxPrefix,
    remotePathText: profile.remotePath ?? '',
  };
};

const toCloneFormState = (profile: ServerProfile): ServerFormState => {
  return {
    ...toFormState(profile),
    label: `${profile.label} (copy)`,
    tmuxPrefixText: serverProfileTmuxUtil.generatePrefix(),
  };
};

const toRemotePathOf = (form: ServerFormState): string | undefined => {
  const trimmedPath = form.remotePathText.trim();
  if (trimmedPath === '') {
    return undefined;
  }

  return remotePathUtil.normalizeRootPath({ path: trimmedPath });
};

const toBrowseInitialPathOf = (form: ServerFormState): string => {
  const trimmedPath = form.remotePathText.trim();
  if (trimmedPath === '') {
    return '/';
  }

  return remotePathUtil.normalizeRootPath({ path: trimmedPath });
};

const toProfileDraft = (form: ServerFormState): Omit<ServerProfile, 'id'> => {
  return {
    label: form.label.trim() || form.host.trim(),
    host: form.host.trim(),
    port: parsePortOf(form) ?? constant.server.defaultPort,
    username: form.username.trim(),
    authMethod: form.authKind,
    acceptedHostKeys: form.acceptedHostKeys,
    tmuxPrefix: form.tmuxPrefixText.trim(),
    remotePath: toRemotePathOf(form),
  };
};

type HostKeyRejection = {
  fingerprint: string;
  hostKeyLine: string;
  variant: HostKeyDialogVariant;
};

const toHostKeyRejectionOf = (error: unknown): HostKeyRejection | null => {
  const bridgeError = error as Partial<SshBridgeError> | null | undefined;
  const code = bridgeError?.code;
  const fingerprint = bridgeError?.fingerprint;
  const hostKeyLine = bridgeError?.hostKeyLine;
  if ((code === 'host-key-unknown' || code === 'host-key-changed') && fingerprint != null && hostKeyLine != null) {
    return {
      fingerprint,
      hostKeyLine,
      variant: code === 'host-key-changed' ? 'host-key-changed' : 'host-key-unknown',
    };
  }

  return null;
};

const toInstallFailureMessage = (result: SshExecResult): string => {
  if (result.stderr !== '') {
    return `Key install failed with code ${result.exitCode ?? 'unknown'}: ${result.stderr.trim()}`;
  }

  return `Key install failed: remote command exited with code ${result.exitCode ?? 'unknown'}`;
};

export function ServerFormScreen({
  profileId,
  cloneSourceId,
  store = serverProfileStore,
  credentialStore = serverCredentialStore,
  createTestClient = createSsh2ShellClient,
}: ServerFormScreenProps) {
  const theme = useTheme();
  const [form, setForm] = useState<ServerFormState>(() => {
    return { ...emptyForm, tmuxPrefixText: serverProfileTmuxUtil.generatePrefix() };
  });
  const [storedSecrets, setStoredSecrets] = useState<ServerProfileSecrets>({});
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });
  const [installPassword, setInstallPassword] = useState('');
  const [installStatus, setInstallStatus] = useState<InstallStatus>({ kind: 'idle' });
  const [deviceKey, setDeviceKey] = useState<DeviceKeyInfo | null>(null);
  const [deviceKeyError, setDeviceKeyError] = useState<string | null>(null);
  const [isDeviceKeyLoaded, setIsDeviceKeyLoaded] = useState(false);
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [pendingHostKey, setPendingHostKey] = useState<PendingHostKey | null>(null);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const isEditing = profileId !== undefined;

  useEffect(() => {
    const loadProfile = async () => {
      if (profileId !== undefined) {
        const profile = await store.findById({ id: profileId });
        if (profile !== null) {
          setForm(toFormState(profile));
        }
        const secrets = await credentialStore.find({ id: profileId });
        if (secrets !== null) {
          setStoredSecrets(secrets);
        }

        return;
      }
      if (cloneSourceId !== undefined) {
        const profile = await store.findById({ id: cloneSourceId });
        if (profile !== null) {
          setForm(toCloneFormState(profile));
        }
        const secrets = await credentialStore.find({ id: cloneSourceId });
        if (secrets !== null) {
          setStoredSecrets(secrets);
        }
      }
    };
    void loadProfile();
  }, [profileId, cloneSourceId, store, credentialStore]);

  useEffect(() => {
    if (form.authKind !== 'deviceKey' || isDeviceKeyLoaded) {
      return;
    }
    const loadDeviceKey = async () => {
      try {
        setDeviceKey(await deviceKeyService.find());
        setDeviceKeyError(null);
      } catch (error) {
        setDeviceKeyError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsDeviceKeyLoaded(true);
      }
    };
    void loadDeviceKey();
  }, [form.authKind, isDeviceKeyLoaded]);

  const updateForm = (patch: Partial<ServerFormState>) => {
    setForm((current) => {
      return { ...current, ...patch };
    });
  };

  const selectAuthKind = (authKind: AuthKind) => {
    updateForm({ authKind });
    setInstallStatus({ kind: 'idle' });
    setTestStatus({ kind: 'idle' });
  };

  const profileDraft = toProfileDraft(form);
  const errors = serverProfileValidator.validate(profileDraft);
  const enteredSecrets = toEnteredSecrets(form);
  const secretsError = serverProfileValidator.validateSecrets({
    authMethod: form.authKind,
    hasStoredSecrets: hasStoredSecretsFor(form.authKind, storedSecrets),
    secrets: enteredSecrets,
  });
  const isValid = serverProfileValidator.isValid(profileDraft) && secretsError === null;
  const isBusy = testStatus.kind === 'testing' || installStatus.kind === 'installing';
  const isDeviceKeyReady = form.authKind !== 'deviceKey' || deviceKey !== null;

  const fieldError = (error: string | null, hasInput: boolean): string | null => {
    if (error === null) {
      return null;
    }
    if (hasInput || hasAttemptedSave) {
      return error;
    }

    return null;
  };

  const toTestAuth = (secrets: ServerProfileSecrets): SshConnectOptions['auth'] => {
    if (form.authKind === 'deviceKey') {
      return { kind: 'privateKey', privateKey: deviceKey?.privateKey ?? '' };
    }
    if (form.authKind === 'password') {
      return { kind: 'password', password: secrets.password ?? storedSecrets.password ?? '' };
    }

    return {
      kind: 'privateKey',
      passphrase: secrets.passphrase ?? storedSecrets.passphrase,
      privateKey: secrets.privateKey ?? storedSecrets.privateKey ?? '',
    };
  };

  const buildTestConnectOptions = (
    secrets: ServerProfileSecrets,
    acceptedHostKeys: string[]
  ): SshConnectOptions => {
    return {
      host: profileDraft.host,
      port: profileDraft.port,
      username: profileDraft.username,
      auth: toTestAuth(secrets),
      cols: constant.terminal.initialSize.cols,
      rows: constant.terminal.initialSize.rows,
      acceptedHostKeys,
    };
  };

  const runTest = (secrets: ServerProfileSecrets, acceptedHostKeys: string[]) => {
    setTestStatus({ kind: 'testing' });
    const client = createTestClient();
    const connect = async () => {
      try {
        await client.connect(buildTestConnectOptions(secrets, acceptedHostKeys));
        client.disconnect();
        setTestStatus({ kind: 'succeeded' });
      } catch (error) {
        handleTestFailure(error);
      }
    };
    void connect();
  };

  const handleTestFailure = (error: unknown) => {
    const rejection = toHostKeyRejectionOf(error);
    if (rejection !== null) {
      setPendingHostKey({ ...rejection, source: 'test' });
      setTestStatus({ kind: 'idle' });

      return;
    }
    const code = (error as Partial<SshBridgeError>)?.code ?? 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    // TODO: Remove when the ssh test TypeError root cause is found - logs the stack to Metro
    console.error('[connection-test] failed:', error);
    setInstallStatus({ kind: 'idle' });
    setTestStatus({ code, kind: 'failed', message: `Connection failed: ${message}` });
  };

  const handleTestPress = () => {
    setInstallStatus({ kind: 'idle' });
    runTest(enteredSecrets, form.acceptedHostKeys);
  };

  const runInstall = (password: string, acceptedHostKeys: string[]) => {
    if (deviceKey === null || password === '') {
      return;
    }
    setInstallStatus({ kind: 'installing' });
    const client = createTestClient();
    const install = async () => {
      try {
        await client.connect({
          ...buildTestConnectOptions({}, acceptedHostKeys),
          auth: { kind: 'password', password },
        });
        const result = await client.exec(buildAuthorizedKeysInstallCommand(deviceKey.publicKey));
        if (result.exitCode !== 0) {
          setInstallStatus({ kind: 'failed', message: toInstallFailureMessage(result) });

          return;
        }
        setInstallStatus({
          kind: 'succeeded',
          note: result.stderr !== '' ? result.stderr.trim() : undefined,
        });
        setIsInstallModalOpen(false);
        runTest(enteredSecrets, acceptedHostKeys);
      } catch (error) {
        handleInstallFailure(error);
      } finally {
        client.disconnect();
      }
    };
    void install();
  };

  const handleInstallFailure = (error: unknown) => {
    const rejection = toHostKeyRejectionOf(error);
    if (rejection !== null) {
      setPendingHostKey({ ...rejection, source: 'install' });
      setInstallStatus({ kind: 'idle' });

      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    setInstallStatus({ kind: 'failed', message: `Key install failed: ${message}` });
  };

  const handleInstallPress = () => {
    runInstall(installPassword, form.acceptedHostKeys);
  };

  const handleAuthenticatePress = () => {
    setInstallStatus({ kind: 'idle' });
    setIsInstallModalOpen(true);
  };

  const handleInstallModalClose = () => {
    setIsInstallModalOpen(false);
  };

  const handleAcceptHostKey = () => {
    if (pendingHostKey === null) {
      return;
    }
    const { source } = pendingHostKey;
    const acceptedHostKeys = mergeAcceptedHostKey(form.acceptedHostKeys, pendingHostKey.hostKeyLine);
    setForm((current) => {
      return { ...current, acceptedHostKeys };
    });
    setPendingHostKey(null);
    if (source === 'install') {
      runInstall(installPassword, acceptedHostKeys);

      return;
    }
    runTest(enteredSecrets, acceptedHostKeys);
  };

  const handleRejectHostKey = () => {
    const source = pendingHostKey?.source;
    setPendingHostKey(null);
    if (source === 'install') {
      setInstallStatus({ kind: 'failed', message: 'Key install failed: Host key was rejected' });

      return;
    }
    setTestStatus({ code: 'unknown', kind: 'failed', message: 'Connection failed: Host key was rejected' });
  };

  const handleBrowsePress = () => {
    setIsBrowseOpen(true);
  };

  const handleBrowseCancel = () => {
    setIsBrowseOpen(false);
  };

  const handleBrowseSelect = (path: string) => {
    updateForm({ remotePathText: path });
    setIsBrowseOpen(false);
  };

  const handleBrowseConnectError = (error: unknown) => {
    setIsBrowseOpen(false);
    handleTestFailure(error);
  };

  const openBrowseSession = () => {
    return remoteBrowseUtil.openSession({
      options: buildTestConnectOptions(enteredSecrets, form.acceptedHostKeys),
      port: createTestClient(),
    });
  };

  const handleSavePress = () => {
    setHasAttemptedSave(true);
    if (!isValid) {
      return;
    }
    const save = async () => {
      const id = profileId ?? serverProfileIdUtil.generateId();
      const secrets = await toSavedSecrets();
      await store.save({ profile: { ...profileDraft, id }, secrets });
      router.back();
    };
    void save();
  };

  const toSavedSecrets = async (): Promise<ServerProfileSecrets | undefined> => {
    if (form.authKind === 'deviceKey') {
      return {};
    }
    const hasEnteredSecrets = Object.keys(enteredSecrets).length > 0;
    if (hasEnteredSecrets) {
      return enteredSecrets;
    }
    if (cloneSourceId === undefined) {
      return undefined;
    }

    return (await credentialStore.find({ id: cloneSourceId })) ?? undefined;
  };

  const handleCancelPress = () => {
    router.back();
  };

  const borderedStyle = { borderColor: theme.textSecondary };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollView
        bottomOffset={16}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="subtitle">{isEditing ? 'Edit Instance' : 'Add Instance'}</ThemedText>

        <ThemedText type="small">Label</ThemedText>
        <ThemedTextInput
          onChangeText={(value) => {
            updateForm({ label: value });
          }}
          placeholder="My build box"
          value={form.label}
        />

        <ThemedText type="small">Host</ThemedText>
        <ThemedTextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            updateForm({ host: value });
          }}
          placeholder="host"
          value={form.host}
        />
        {fieldError(errors.host, form.host !== '') !== null ? (
          <ThemedText type="small" style={styles.errorText}>
            {errors.host}
          </ThemedText>
        ) : null}

        <ThemedText type="small">Port</ThemedText>
        <ThemedTextInput
          keyboardType="number-pad"
          onChangeText={(value) => {
            updateForm({ portText: value });
          }}
          placeholder="22"
          value={form.portText}
        />
        {fieldError(errors.port, form.portText !== '') !== null ? (
          <ThemedText type="small" style={styles.errorText}>
            {errors.port}
          </ThemedText>
        ) : null}

        <ThemedText type="small">Username</ThemedText>
        <ThemedTextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            updateForm({ username: value });
          }}
          placeholder="username"
          value={form.username}
        />
        {fieldError(errors.username, form.username !== '') !== null ? (
          <ThemedText type="small" style={styles.errorText}>
            {errors.username}
          </ThemedText>
        ) : null}

        <ThemedText type="small">Authentication</ThemedText>
        <View style={styles.authPicker}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              selectAuthKind('password');
            }}
            style={[styles.authOption, borderedStyle, form.authKind === 'password' && styles.authOptionActive]}
          >
            <ThemedText type="small">Password</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              selectAuthKind('privateKey');
            }}
            style={[styles.authOption, borderedStyle, form.authKind === 'privateKey' && styles.authOptionActive]}
          >
            <ThemedText type="small">Private key</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              selectAuthKind('deviceKey');
            }}
            style={[styles.authOption, borderedStyle, form.authKind === 'deviceKey' && styles.authOptionActive]}
          >
            <ThemedText type="small">Device key</ThemedText>
          </Pressable>
        </View>

        {form.authKind === 'password' ? (
          <>
            <ThemedText type="small">Password</ThemedText>
            <ThemedTextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => {
                updateForm({ password: value });
              }}
              placeholder={isEditing ? 'Leave blank to keep the saved password' : 'password'}
              secureTextEntry
              value={form.password}
            />
            {fieldError(secretsError, form.password !== '') !== null ? (
              <ThemedText type="small" style={styles.errorText}>
                {secretsError}
              </ThemedText>
            ) : null}
          </>
        ) : form.authKind === 'deviceKey' ? (
          <>
            {deviceKeyError !== null ? (
              <ThemedText type="small" style={styles.errorText}>
                Device key unavailable: {deviceKeyError}
              </ThemedText>
            ) : !isDeviceKeyLoaded ? (
              <ThemedText type="small">Loading device key…</ThemedText>
            ) : deviceKey === null ? (
              <ThemedText type="small">No device key on this device yet. Generate one in Settings &gt; SSH Key.</ThemedText>
            ) : null}
            <View style={styles.deviceKeyActions}>
              <Pressable
                accessibilityRole="button"
                disabled={deviceKey === null}
                onPress={handleAuthenticatePress}
                style={[styles.button, borderedStyle, deviceKey === null && styles.buttonDisabled]}
                testID="device-key-authenticate-button"
              >
                <ThemedText type="smallBold">Authenticate Device Key with Instance</ThemedText>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <ThemedText type="small">Private key</ThemedText>
            <ThemedTextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={(value) => {
                updateForm({ privateKey: value });
              }}
              placeholder={isEditing ? 'Leave blank to keep the saved key' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
              style={styles.keyInput}
              value={form.privateKey}
            />
            {fieldError(secretsError, form.privateKey !== '') !== null ? (
              <ThemedText type="small" style={styles.errorText}>
                {secretsError}
              </ThemedText>
            ) : null}
            <ThemedText type="small">Passphrase (optional)</ThemedText>
            <ThemedTextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => {
                updateForm({ passphrase: value });
              }}
              placeholder="passphrase"
              secureTextEntry
              value={form.passphrase}
            />
          </>
        )}

        <ThemedText type="small">Remote Path</ThemedText>
        <View style={styles.remotePathRow}>
          <ThemedTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              updateForm({ remotePathText: value });
            }}
            placeholder="/"
            style={styles.remotePathInput}
            value={form.remotePathText}
          />
          <Pressable
            accessibilityLabel="Browse remote folders"
            accessibilityRole="button"
            disabled={!isValid || isBusy || !isDeviceKeyReady}
            onPress={handleBrowsePress}
            style={styles.browseButton}
          >
            <MaterialCommunityIcons color={theme.text} name="folder-outline" size={24} />
          </Pressable>
        </View>

        {testStatus.kind === 'testing' ? (
          <ThemedText type="small" style={styles.statusText}>
            Testing connection…
          </ThemedText>
        ) : null}
        {testStatus.kind === 'succeeded' ? (
          <ThemedText type="small" style={styles.statusText}>
            Connection successful
          </ThemedText>
        ) : null}
        {testStatus.kind === 'failed' ? (
          <ThemedText type="small" style={styles.errorText}>
            {testStatus.message}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy || !isDeviceKeyReady}
            onPress={handleTestPress}
            style={[styles.button, borderedStyle, (isBusy || !isDeviceKeyReady) && styles.buttonDisabled]}
          >
            <ThemedText type="smallBold">Test Connection</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleCancelPress} style={[styles.button, borderedStyle]}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || isBusy || !isDeviceKeyReady}
            onPress={handleSavePress}
            style={[
              styles.button,
              borderedStyle,
              styles.saveButton,
              (!isValid || isBusy || !isDeviceKeyReady) && styles.buttonDisabled,
            ]}
          >
            <ThemedText type="smallBold">Save</ThemedText>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
      {pendingHostKey?.source === 'test' ? (
        <HostKeyDialog
          fingerprint={pendingHostKey.fingerprint}
          onAccept={handleAcceptHostKey}
          onReject={handleRejectHostKey}
          variant={pendingHostKey.variant}
        />
      ) : null}
      <FolderBrowserModal
        initialPath={toBrowseInitialPathOf(form)}
        isVisible={isBrowseOpen}
        openSession={openBrowseSession}
        onCancel={handleBrowseCancel}
        onConnectError={handleBrowseConnectError}
        onSelect={handleBrowseSelect}
      />
      <DeviceKeyInstallModal
        installStatus={installStatus}
        isBusy={isBusy}
        isVisible={isInstallModalOpen}
        password={installPassword}
        pendingHostKey={pendingHostKey?.source === 'install' ? pendingHostKey : null}
        onAcceptHostKey={handleAcceptHostKey}
        onClose={handleInstallModalClose}
        onInstallPress={handleInstallPress}
        onPasswordChange={setInstallPassword}
        onRejectHostKey={handleRejectHostKey}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    gap: 8,
    padding: 16,
  },
  keyInput: {
    fontFamily: 'monospace',
    minHeight: 96,
    textAlignVertical: 'top',
  },
  authPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  authOption: {
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authOptionActive: {
    borderWidth: 2,
  },
  remotePathRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  remotePathInput: {
    flex: 1,
  },
  browseButton: {
    paddingVertical: 6,
  },
  deviceKeyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveButton: {
    borderWidth: 2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#d32f2f',
  },
  statusText: {
    marginTop: 8,
  },
});
