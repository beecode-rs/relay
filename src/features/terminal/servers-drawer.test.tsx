import { fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { appInfo } from '@/constants/app';
import { ServersDrawer } from '@/features/terminal/servers-drawer';
import type { ServersDrawerProps, ServersDrawerServer } from '@/features/terminal/servers-drawer';

jest.mock('react-native-safe-area-context', () => {
  return {
    useSafeAreaInsets: () => {
      return { bottom: 0, left: 0, right: 0, top: 0 };
    },
  };
});

const SERVER_A: ServersDrawerServer = {
  profileId: 'profile-a',
  displayName: 'alpha',
  status: 'connected',
  sessionNames: ['work', 'play'],
  currentSessionName: 'work',
  defaultPath: '/srv/app',
  isLoading: false,
  listError: null,
};

const SERVER_B: ServersDrawerServer = {
  profileId: 'profile-b',
  displayName: 'beta',
  status: 'connected',
  sessionNames: ['solo'],
  currentSessionName: null,
  defaultPath: '/opt/data',
  isLoading: false,
  listError: null,
};

const SERVER_C: ServersDrawerServer = {
  profileId: 'profile-c',
  displayName: 'gamma',
  status: 'disconnected',
  sessionNames: [],
  currentSessionName: null,
  defaultPath: '/var/www',
  isLoading: false,
  listError: null,
};

const createProps = (overrides: Partial<ServersDrawerProps> = {}): ServersDrawerProps => {
  return {
    isOpen: true,
    servers: [SERVER_A, SERVER_B, SERVER_C],
    currentProfileId: 'profile-a',
    onClose: jest.fn(),
    onAddServer: jest.fn(),
    onOpenSettings: jest.fn(),
    onSelectServer: jest.fn(),
    onSelectSession: jest.fn(),
    onCreateSession: jest.fn(),
    onRenameSession: jest.fn(),
    onCloneSession: jest.fn(),
    onDeleteSession: jest.fn(),
    onDisconnectServer: jest.fn(),
    onRefreshServer: jest.fn(),
    onEditServer: jest.fn(),
    onRemoveServer: jest.fn(),
    ...overrides,
  };
};

const openServerMenu = async (props: ServersDrawerProps, profileId: string) => {
  const renderResult = await render(<ServersDrawer {...props} />);
  await fireEvent.press(renderResult.getByTestId(`servers-drawer-menu-${profileId}`));

  return renderResult;
};

const openSessionMenu = async (
  props: ServersDrawerProps,
  profileId: string,
  sessionName: string
) => {
  const renderResult = await render(<ServersDrawer {...props} />);
  await fireEvent.press(renderResult.getByTestId(`servers-drawer-session-menu-${profileId}-${sessionName}`));

  return renderResult;
};

describe('ServersDrawer rendering', () => {
  it('renders nothing while closed', async () => {
    const { queryByTestId } = await render(<ServersDrawer {...createProps({ isOpen: false })} />);
    expect(queryByTestId('servers-drawer')).toBeNull();
  });

  it('shows the app icon and name in the header', async () => {
    const { getByTestId, getByText } = await render(<ServersDrawer {...createProps()} />);
    expect(getByTestId('servers-drawer-app-icon')).toBeTruthy();
    expect(getByText(appInfo.name)).toBeTruthy();
  });

  it('renders every instance group with its sessions', async () => {
    const { getByText, getByTestId } = await render(<ServersDrawer {...createProps()} />);
    expect(getByTestId('servers-drawer-server-profile-a')).toBeTruthy();
    expect(getByTestId('servers-drawer-server-profile-b')).toBeTruthy();
    expect(getByTestId('servers-drawer-server-profile-c')).toBeTruthy();
    expect(getByText('work')).toBeTruthy();
    expect(getByText('play')).toBeTruthy();
    expect(getByText('solo')).toBeTruthy();
  });

  it('hints that a saved instance is not connected', async () => {
    const { getByText } = await render(<ServersDrawer {...createProps()} />);
    expect(getByText('Not connected')).toBeTruthy();
  });

  it('shows an empty hint when no instances are saved', async () => {
    const { getByText } = await render(<ServersDrawer {...createProps({ servers: [] })} />);
    expect(getByText('No instances yet')).toBeTruthy();
  });

  it('marks only the current session of the current instance as selected', async () => {
    const { getByTestId } = await render(<ServersDrawer {...createProps()} />);
    expect(getByTestId('tmux-session-row-profile-a-work').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('tmux-session-row-profile-a-play').props.accessibilityState).toEqual({ selected: false });
    expect(getByTestId('tmux-session-row-profile-b-solo').props.accessibilityState).toEqual({ selected: false });
  });

  it('styles the current session row with the accent marker', async () => {
    const { getByTestId } = await render(<ServersDrawer {...createProps()} />);
    const rowStyle = StyleSheet.flatten(getByTestId('tmux-session-row-profile-a-work').props.style);
    expect(rowStyle.backgroundColor).toBe('#1a241a');
    expect(rowStyle.borderLeftColor).toBe('#00cd00');
  });

  it('shows per-instance loading, error, and empty hints', async () => {
    const { getByText, getByTestId } = await render(
      <ServersDrawer
        {...createProps({
          servers: [
            { ...SERVER_A, sessionNames: [], currentSessionName: null, isLoading: true },
            { ...SERVER_B, sessionNames: [], currentSessionName: null, listError: 'listing failed' },
            SERVER_C,
          ],
        })}
      />
    );
    expect(getByText('Loading…')).toBeTruthy();
    expect(getByTestId('servers-drawer-loading-profile-a')).toBeTruthy();
    expect(getByText('listing failed')).toBeTruthy();
    expect(getByText('Not connected')).toBeTruthy();
  });

  it('keeps loaded sessions visible while reloading and spins on the instance row', async () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = await render(
      <ServersDrawer
        {...createProps({
          servers: [{ ...SERVER_A, isLoading: true }, SERVER_B, SERVER_C],
        })}
      />
    );
    expect(getByTestId('servers-drawer-loading-profile-a')).toBeTruthy();
    expect(getByText('work')).toBeTruthy();
    expect(getByText('play')).toBeTruthy();
    expect(queryByText('Loading…')).toBeNull();
    expect(queryByTestId('servers-drawer-loading-profile-b')).toBeNull();
  });
});

describe('ServersDrawer instance selection', () => {
  it('selects the detached instance terminal on instance name press', async () => {
    const onSelectServer = jest.fn();
    const { getByTestId } = await render(<ServersDrawer {...createProps({ onSelectServer })} />);
    await fireEvent.press(getByTestId('servers-drawer-server-profile-b'));
    expect(onSelectServer).toHaveBeenCalledWith('profile-b');
  });

  it('collapses and expands an instance group from the chevron', async () => {
    const { getByTestId, getByText, queryByText } = await render(<ServersDrawer {...createProps()} />);
    expect(getByText('work')).toBeTruthy();
    await fireEvent.press(getByTestId('servers-drawer-chevron-profile-a'));
    expect(queryByText('work')).toBeNull();
    expect(getByText('solo')).toBeTruthy();
    await fireEvent.press(getByTestId('servers-drawer-chevron-profile-a'));
    expect(getByText('work')).toBeTruthy();
  });

  it('selects a session on press', async () => {
    const onSelectSession = jest.fn();
    const { getByTestId } = await render(<ServersDrawer {...createProps({ onSelectSession })} />);
    await fireEvent.press(getByTestId('tmux-session-row-profile-b-solo'));
    expect(onSelectSession).toHaveBeenCalledWith('profile-b', 'solo');
  });
});

describe('ServersDrawer instance menu', () => {
  it('opens the menu from the kebab button', async () => {
    const { getByTestId } = await render(<ServersDrawer {...createProps()} />);
    await fireEvent.press(getByTestId('servers-drawer-menu-profile-b'));
    expect(getByTestId('servers-drawer-menu')).toBeTruthy();
  });

  it('offers session and connection actions only while connected', async () => {
    const view = await openServerMenu(createProps(), 'profile-c');
    expect(view.queryByTestId('servers-drawer-new-session-profile-c')).toBeNull();
    expect(view.queryByTestId('servers-drawer-refresh-profile-c')).toBeNull();
    expect(view.queryByTestId('servers-drawer-disconnect-profile-c')).toBeNull();
    expect(view.getByTestId('servers-drawer-edit-profile-c')).toBeTruthy();
    expect(view.getByTestId('servers-drawer-remove-profile-c')).toBeTruthy();
  });

  it('refreshes only the target instance', async () => {
    const onRefreshServer = jest.fn();
    const props = createProps({ onRefreshServer });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-refresh-profile-b'));
    expect(onRefreshServer).toHaveBeenCalledWith('profile-b');
  });

  it('asks to confirm before disconnecting an instance', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onDisconnectServer = jest.fn();
    const props = createProps({ onDisconnectServer });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-disconnect-profile-b'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Disconnect');
    expect(alertSpy.mock.calls[0]?.[1]).toContain('beta');
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => { return button.text; })).toEqual(['Cancel', 'Disconnect']);
    expect(buttons[1]?.style).toBe('destructive');
    buttons[1]?.onPress?.();
    expect(onDisconnectServer).toHaveBeenCalledWith('profile-b');
    alertSpy.mockRestore();
  });

  it('keeps the instance connected when disconnecting is cancelled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onDisconnectServer = jest.fn();
    const props = createProps({ onDisconnectServer });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-disconnect-profile-b'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons[0]?.onPress?.();
    expect(onDisconnectServer).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('edits the target instance', async () => {
    const onEditServer = jest.fn();
    const props = createProps({ onEditServer });
    const view = await openServerMenu(props, 'profile-c');
    await fireEvent.press(view.getByTestId('servers-drawer-edit-profile-c'));
    expect(onEditServer).toHaveBeenCalledWith('profile-c');
  });

  it('asks to confirm before removing an instance', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onRemoveServer = jest.fn();
    const props = createProps({ onRemoveServer });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-remove-profile-b'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Remove instance');
    expect(alertSpy.mock.calls[0]?.[1]).toContain('beta');
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => { return button.text; })).toEqual(['Cancel', 'Remove']);
    expect(buttons[1]?.style).toBe('destructive');
    buttons[1]?.onPress?.();
    expect(onRemoveServer).toHaveBeenCalledWith('profile-b');
    alertSpy.mockRestore();
  });

  it('keeps the instance when removing is cancelled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onRemoveServer = jest.fn();
    const props = createProps({ onRemoveServer });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-remove-profile-b'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons[0]?.onPress?.();
    expect(onRemoveServer).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('ServersDrawer new session prompt', () => {
  it('opens the prompt from the instance menu with the instance default name and path', async () => {
    const props = createProps();
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-new-session-profile-b'));
    expect(view.getByTestId('tmux-new-session-name-input').props.placeholder).toBe('s01');
    expect(view.getByTestId('tmux-new-session-path-input').props.placeholder).toBe('/opt/data');
  });

  it('creates a session on the target instance', async () => {
    const onCreateSession = jest.fn();
    const props = createProps({ onCreateSession });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-new-session-profile-b'));
    await fireEvent.changeText(view.getByTestId('tmux-new-session-name-input'), 'deploy');
    await fireEvent.press(view.getByText('Create'));
    expect(onCreateSession).toHaveBeenCalledWith('profile-b', 'deploy', '/opt/data');
  });

  it('falls back to the next default name when the input is left empty', async () => {
    const onCreateSession = jest.fn();
    const props = createProps({ onCreateSession });
    const view = await openServerMenu(props, 'profile-a');
    await fireEvent.press(view.getByTestId('servers-drawer-new-session-profile-a'));
    await fireEvent.press(view.getByText('Create'));
    expect(onCreateSession).toHaveBeenCalledWith('profile-a', 's01', '/srv/app');
  });

  it('hides the browse button without a browse session', async () => {
    const props = createProps();
    const view = await openServerMenu(props, 'profile-a');
    await fireEvent.press(view.getByTestId('servers-drawer-new-session-profile-a'));
    expect(view.queryByLabelText('Browse remote folders')).toBeNull();
  });

  it('fills the path from the folder browser on the target instance', async () => {
    const listCalls: string[] = [];
    const openBrowseSession = (profileId: string) => {
      return Promise.resolve({
        listDirectories: async (params: { path: string }) => {
          listCalls.push(`${profileId}:${params.path}`);

          return ['app'];
        },
        disconnect: () => {
          return;
        },
      });
    };
    const props = createProps({ openBrowseSession });
    const view = await openServerMenu(props, 'profile-b');
    await fireEvent.press(view.getByTestId('servers-drawer-new-session-profile-b'));
    await fireEvent.press(view.getByLabelText('Browse remote folders'));
    await fireEvent.press(view.getByText('app'));
    await fireEvent.press(view.getByText('Use this folder'));
    expect(view.getByTestId('tmux-new-session-path-input').props.value).toBe('/opt/data/app');
    expect(listCalls).toEqual(['profile-b:/opt/data', 'profile-b:/opt/data/app']);
  });
});

describe('ServersDrawer session menu', () => {
  it('opens the session menu from the kebab button', async () => {
    const { getByTestId } = await render(<ServersDrawer {...createProps()} />);
    await fireEvent.press(getByTestId('servers-drawer-session-menu-profile-b-solo'));
    expect(getByTestId('servers-drawer-session-menu')).toBeTruthy();
  });

  it('renames a session with the edited name', async () => {
    const onRenameSession = jest.fn();
    const props = createProps({ onRenameSession });
    const view = await openSessionMenu(props, 'profile-b', 'solo');
    await fireEvent.press(view.getByTestId('servers-drawer-rename-profile-b-solo'));
    expect(view.getByTestId('tmux-rename-session-input').props.value).toBe('solo');
    await fireEvent.changeText(view.getByTestId('tmux-rename-session-input'), 'fresh');
    await fireEvent.press(view.getByText('Rename'));
    expect(onRenameSession).toHaveBeenCalledWith('profile-b', 'solo', 'fresh');
  });

  it('clones the session', async () => {
    const onCloneSession = jest.fn();
    const props = createProps({ onCloneSession });
    const view = await openSessionMenu(props, 'profile-b', 'solo');
    await fireEvent.press(view.getByTestId('servers-drawer-clone-profile-b-solo'));
    expect(onCloneSession).toHaveBeenCalledWith('profile-b', 'solo');
  });

  it('asks to confirm before killing a session', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onDeleteSession = jest.fn();
    const props = createProps({ onDeleteSession });
    const view = await openSessionMenu(props, 'profile-b', 'solo');
    await fireEvent.press(view.getByTestId('servers-drawer-kill-profile-b-solo'));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Kill session');
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => { return button.text; })).toEqual(['Cancel', 'Kill']);
    expect(buttons[1]?.style).toBe('destructive');
    buttons[1]?.onPress?.();
    expect(onDeleteSession).toHaveBeenCalledWith('profile-b', 'solo');
    alertSpy.mockRestore();
  });

  it('keeps the session when killing is cancelled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onDeleteSession = jest.fn();
    const props = createProps({ onDeleteSession });
    const view = await openSessionMenu(props, 'profile-b', 'solo');
    await fireEvent.press(view.getByTestId('servers-drawer-kill-profile-b-solo'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons[0]?.onPress?.();
    expect(onDeleteSession).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('rejects a duplicate name only within the same instance', async () => {
    const onRenameSession = jest.fn();
    const props = createProps({ onRenameSession });
    const view = await openSessionMenu(props, 'profile-b', 'solo');
    await fireEvent.press(view.getByTestId('servers-drawer-rename-profile-b-solo'));
    // 'work' exists on profile-a, so renaming profile-b's session to it is fine.
    await fireEvent.changeText(view.getByTestId('tmux-rename-session-input'), 'work');
    await fireEvent.press(view.getByText('Rename'));
    expect(onRenameSession).toHaveBeenCalledWith('profile-b', 'solo', 'work');

    // But renaming profile-a's session to its sibling 'play' is a duplicate.
    await fireEvent.press(view.getByTestId('servers-drawer-session-menu-profile-a-work'));
    await fireEvent.press(view.getByTestId('servers-drawer-rename-profile-a-work'));
    await fireEvent.changeText(view.getByTestId('tmux-rename-session-input'), 'play');
    await fireEvent.press(view.getByText('Rename'));
    expect(view.getByText('A session named "play" already exists')).toBeTruthy();
    expect(onRenameSession).toHaveBeenCalledTimes(1);
  });

  it('shows an error when the name contains characters tmux forbids', async () => {
    const onRenameSession = jest.fn();
    const props = createProps({ onRenameSession });
    const view = await openSessionMenu(props, 'profile-a', 'work');
    await fireEvent.press(view.getByTestId('servers-drawer-rename-profile-a-work'));
    await fireEvent.changeText(view.getByTestId('tmux-rename-session-input'), 'my.session');
    await fireEvent.press(view.getByText('Rename'));
    expect(onRenameSession).not.toHaveBeenCalled();
    expect(view.getByText("Session names cannot contain '.' or ':'")).toBeTruthy();
  });
});

describe('ServersDrawer footer and header', () => {
  it('adds an instance from the header plus button', async () => {
    const onAddServer = jest.fn();
    const { getByLabelText } = await render(<ServersDrawer {...createProps({ onAddServer })} />);
    await fireEvent.press(getByLabelText('Add instance'));
    expect(onAddServer).toHaveBeenCalledTimes(1);
  });

  it('closes from the header close button', async () => {
    const onClose = jest.fn();
    const { getAllByLabelText } = await render(<ServersDrawer {...createProps({ onClose })} />);
    await fireEvent.press(getAllByLabelText('Close instances drawer')[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens settings on press', async () => {
    const onOpenSettings = jest.fn();
    const { getByLabelText } = await render(<ServersDrawer {...createProps({ onOpenSettings })} />);
    await fireEvent.press(getByLabelText('Open settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
