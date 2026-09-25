import { fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { TmuxSessionsDrawer } from '@/features/terminal/tmux-sessions-drawer';

jest.mock('react-native-safe-area-context', () => {
  return {
    useSafeAreaInsets: () => {
      return { bottom: 0, left: 0, right: 0, top: 0 };
    },
  };
});

describe('TmuxSessionsDrawer', () => {
  it('renders nothing while closed', async () => {
    const { queryByTestId } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen={false}
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    expect(queryByTestId('tmux-sessions-drawer')).toBeNull();
  });

  it('renders the session names while open', async () => {
    const { getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work', 'play']}
      />
    );
    expect(getByText('Sessions')).toBeTruthy();
    expect(getByText('work')).toBeTruthy();
    expect(getByText('play')).toBeTruthy();
  });

  it('shows the listing error instead of the empty hint when listing failed', async () => {
    const { getByText, queryByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        listError="Could not list tmux sessions: exec channel refused"
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    expect(getByText('Could not list tmux sessions: exec channel refused')).toBeTruthy();
    expect(queryByText('No tmux sessions')).toBeNull();
  });

  it('shows a loading hint while sessions are loading', async () => {
    const { getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    expect(getByText('Loading…')).toBeTruthy();
  });

  it('shows an empty hint when there are no sessions', async () => {
    const { getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    expect(getByText('No tmux sessions')).toBeTruthy();
  });

  it('selects a session on press', async () => {
    const onSelect = jest.fn();
    const { getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={onSelect}
        sessionNames={['work']}
      />
    );
    fireEvent.press(getByText('work'));
    expect(onSelect).toHaveBeenCalledWith('work');
  });

  it('renders the detach row above the session list', async () => {
    const { getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    expect(getByTestId('tmux-detach-row')).toBeTruthy();
    expect(getByText('Detach from session')).toBeTruthy();
  });

  it('detaches on press', async () => {
    const onDetach = jest.fn();
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={onDetach}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    fireEvent.press(getByLabelText('Detach from session'));
    expect(onDetach).toHaveBeenCalledTimes(1);
  });

  it('closes from the header close button', async () => {
    const onClose = jest.fn();
    const { getAllByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={onClose}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    fireEvent.press(getAllByLabelText('Close sessions drawer')[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the settings row in the footer', async () => {
    const { getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    expect(getByTestId('tmux-settings-row')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
  });

  it('opens settings on press', async () => {
    const onOpenSettings = jest.fn();
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={onOpenSettings}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    fireEvent.press(getByLabelText('Open settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('TmuxSessionsDrawer new session prompt', () => {
  it('opens the prompt from the plus button with the next default name as placeholder', async () => {
    const { getByLabelText, getByTestId, queryByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['s01']}
      />
    );
    expect(queryByText('New session')).toBeNull();
    await fireEvent.press(getByLabelText('New session'));
    expect(getByTestId('tmux-new-session-name-input').props.placeholder).toBe('s02');
  });

  it('creates a session with the typed name', async () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={onCreate}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['s01']}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.changeText(getByTestId('tmux-new-session-name-input'), 'work');
    await fireEvent.press(getByText('Create'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('work', '/srv/app');
  });

  it('falls back to the next default name when the input is left empty', async () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={onCreate}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['s01', 's02']}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.press(getByText('Create'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('s03', '/srv/app');
  });

  it('falls back to s01 when no sessions exist yet', async () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={onCreate}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.press(getByText('Create'));
    expect(onCreate).toHaveBeenCalledWith('s01', '/srv/app');
  });

  it('discards the prompt on cancel without creating', async () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByTestId, getByText, queryByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={onCreate}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['s01']}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.changeText(getByTestId('tmux-new-session-name-input'), 'work');
    await fireEvent.press(getByText('Cancel'));
    expect(onCreate).not.toHaveBeenCalled();
    expect(queryByText('New session')).toBeNull();
  });
});

describe('TmuxSessionsDrawer new session path', () => {
  it('shows the default path as the placeholder', async () => {
    const { getByLabelText, getByTestId } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    expect(getByTestId('tmux-new-session-path-input').props.placeholder).toBe('/srv/app');
  });

  it('falls back to a slash placeholder without a default path', async () => {
    const { getByLabelText, getByTestId } = await render(
      <TmuxSessionsDrawer
        defaultPath=""
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    expect(getByTestId('tmux-new-session-path-input').props.placeholder).toBe('/');
  });

  it('creates with the typed path instead of the default', async () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={onCreate}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.changeText(getByTestId('tmux-new-session-path-input'), '/opt/data');
    await fireEvent.press(getByText('Create'));
    expect(onCreate).toHaveBeenCalledWith('s01', '/opt/data');
  });

  it('creates with an empty path when no default and none entered', async () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath=""
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={onCreate}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.press(getByText('Create'));
    expect(onCreate).toHaveBeenCalledWith('s01', '');
  });

  it('hides the browse button without a browse session', async () => {
    const { getByLabelText, queryByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    expect(queryByLabelText('Browse remote folders')).toBeNull();
  });

  it('fills the path from the folder browser', async () => {
    const listCalls: string[] = [];
    const openBrowseSession = () => {
      return Promise.resolve({
        listDirectories: async (params: { path: string }) => {
          listCalls.push(params.path);

          return ['app'];
        },
        disconnect: () => {
          return;
        },
      });
    };
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        openBrowseSession={openBrowseSession}
        sessionNames={[]}
      />
    );
    await fireEvent.press(getByLabelText('New session'));
    await fireEvent.press(getByLabelText('Browse remote folders'));
    await fireEvent.press(getByText('app'));
    await fireEvent.press(getByText('Use this folder'));

    expect(getByTestId('tmux-new-session-path-input').props.value).toBe('/srv/app');
    expect(listCalls).toEqual(['/srv', '/srv/app']);
  });
});

describe('TmuxSessionsDrawer session delete', () => {
  it('renders a trash button next to each session name', async () => {
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work', 'play']}
      />
    );
    expect(getByLabelText('Close session work')).toBeTruthy();
    expect(getByLabelText('Close session play')).toBeTruthy();
  });

  it('asks to confirm before closing a session', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Close session work'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Close session');
    expect(alertSpy.mock.calls[0]?.[1]).toContain('work');
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => { return button.text; })).toEqual(['Cancel', 'Close']);
    expect(buttons[1]?.style).toBe('destructive');
    alertSpy.mockRestore();
  });

  it('deletes the session after confirming without selecting it', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onDelete = jest.fn();
    const onSelect = jest.fn();
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={onDelete}
        onSelect={onSelect}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Close session work'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    const confirmButton = buttons.find((button) => {
      return button.text === 'Close';
    });
    confirmButton?.onPress?.();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('work');
    expect(onSelect).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('keeps the session when closing is cancelled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    const onDelete = jest.fn();
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={onDelete}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Close session work'));
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons[0]?.onPress?.();
    expect(onDelete).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('TmuxSessionsDrawer session rename', () => {
  it('renders a rename button next to each session name', async () => {
    const { getByLabelText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work', 'play']}
      />
    );
    expect(getByLabelText('Rename session work')).toBeTruthy();
    expect(getByLabelText('Rename session play')).toBeTruthy();
  });

  it('opens the rename prompt prefilled with the current name', async () => {
    const { getByLabelText, getByTestId, queryByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    expect(queryByText('Rename session')).toBeNull();
    await fireEvent.press(getByLabelText('Rename session work'));
    expect(getByTestId('tmux-rename-session-input').props.value).toBe('work');
  });

  it('renames the session with the edited name', async () => {
    const onRename = jest.fn();
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Rename session work'));
    await fireEvent.changeText(getByTestId('tmux-rename-session-input'), 'play');
    await fireEvent.press(getByText('Rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('work', 'play');
  });

  it('shows an error and does not rename when the name is left empty', async () => {
    const onRename = jest.fn();
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Rename session work'));
    await fireEvent.changeText(getByTestId('tmux-rename-session-input'), '   ');
    await fireEvent.press(getByText('Rename'));
    expect(onRename).not.toHaveBeenCalled();
    expect(getByText('Enter a session name')).toBeTruthy();
  });

  it('shows an error when the name contains characters tmux forbids', async () => {
    const onRename = jest.fn();
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Rename session work'));
    await fireEvent.changeText(getByTestId('tmux-rename-session-input'), 'my.session');
    await fireEvent.press(getByText('Rename'));
    expect(onRename).not.toHaveBeenCalled();
    expect(getByText("Session names cannot contain '.' or ':'")).toBeTruthy();
  });

  it('shows an error when another session already uses the name', async () => {
    const onRename = jest.fn();
    const { getByLabelText, getByTestId, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
        sessionNames={['work', 'play']}
      />
    );
    await fireEvent.press(getByLabelText('Rename session work'));
    await fireEvent.changeText(getByTestId('tmux-rename-session-input'), 'play');
    await fireEvent.press(getByText('Rename'));
    expect(onRename).not.toHaveBeenCalled();
    expect(getByText('A session named "play" already exists')).toBeTruthy();
  });

  it('allows keeping the name unchanged', async () => {
    const onRename = jest.fn();
    const { getByLabelText, getByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Rename session work'));
    await fireEvent.press(getByText('Rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('work', 'work');
  });

  it('discards the prompt on cancel without renaming', async () => {
    const onRename = jest.fn();
    const { getByLabelText, getByTestId, getByText, queryByText } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onDelete={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    await fireEvent.press(getByLabelText('Rename session work'));
    await fireEvent.changeText(getByTestId('tmux-rename-session-input'), 'play');
    await fireEvent.press(getByText('Cancel'));
    expect(onRename).not.toHaveBeenCalled();
    expect(queryByText('Rename session')).toBeNull();
  });
});

describe('TmuxSessionsDrawer current session highlight', () => {
  it('marks only the current session row as selected', async () => {
    const { getByTestId } = await render(
      <TmuxSessionsDrawer
        currentSessionName="work"
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work', 'play']}
      />
    );
    expect(getByTestId('tmux-session-row-work').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('tmux-session-row-play').props.accessibilityState).toEqual({ selected: false });
  });

  it('styles the current session row with the accent marker', async () => {
    const { getByTestId } = await render(
      <TmuxSessionsDrawer
        currentSessionName="work"
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    const rowStyle = StyleSheet.flatten(getByTestId('tmux-session-row-work').props.style);
    expect(rowStyle.backgroundColor).toBe('#1a241a');
    expect(rowStyle.borderLeftColor).toBe('#00cd00');
  });

  it('marks no row as selected without a current session', async () => {
    const { getByTestId } = await render(
      <TmuxSessionsDrawer
        defaultPath="/srv/app"
        isLoading={false}
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn()}
        onOpenSettings={jest.fn()}
        onDetach={jest.fn()}
        onRename={jest.fn()}
        onDelete={jest.fn()}
        onSelect={jest.fn()}
        sessionNames={['work']}
      />
    );
    expect(getByTestId('tmux-session-row-work').props.accessibilityState).toEqual({ selected: false });
  });
});
