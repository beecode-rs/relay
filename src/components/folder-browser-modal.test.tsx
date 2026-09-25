import { act, fireEvent, render } from '@testing-library/react-native';

import { FolderBrowserModal } from '@/components/folder-browser-modal';
import type { RemoteBrowseSession } from '@/services/terminal/remote-browse';

type ScriptedBrowse = {
  session: RemoteBrowseSession;
  listCalls: string[];
  disconnectCount: () => number;
};

const createScriptedBrowse = (listings: Record<string, string[] | Error>): ScriptedBrowse => {
  const listCalls: string[] = [];
  const state = { disconnectCount: 0 };
  const session: RemoteBrowseSession = {
    listDirectories: async (params: { path: string }) => {
      listCalls.push(params.path);
      const listing = listings[params.path];
      if (listing instanceof Error) {
        throw listing;
      }
      if (listing === undefined) {
        throw new Error('No script');
      }

      return listing;
    },
    disconnect: () => {
      state.disconnectCount += 1;
    },
  };

  return { disconnectCount: () => {
    return state.disconnectCount;
  }, listCalls, session };
};

describe('FolderBrowserModal', () => {
  it('renders nothing while closed', async () => {
    const browse = createScriptedBrowse({});
    const { queryByTestId } = await render(
      <FolderBrowserModal
        initialPath="/"
        isVisible={false}
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    expect(queryByTestId('folder-browser-modal')).toBeNull();
  });

  it('connects, lists the initial path and shows its subdirectories', async () => {
    const browse = createScriptedBrowse({ '/home/user': ['projects', 'src'] });
    const { findByText, getByTestId } = await render(
      <FolderBrowserModal
        initialPath="/home/user"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    expect(getByTestId('folder-browser-current-path').props.children).toBe('/home/user');
    expect(await findByText('projects')).toBeTruthy();
    expect(browse.listCalls).toEqual(['/home/user']);
  });

  it('falls back to the root when the initial path cannot be listed', async () => {
    const browse = createScriptedBrowse({
      '/': ['etc', 'home'],
      '/restricted': new Error('Permission denied'),
    });
    const { findByText, getByTestId } = await render(
      <FolderBrowserModal
        initialPath="/restricted"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    expect(await findByText('home')).toBeTruthy();
    expect(getByTestId('folder-browser-current-path').props.children).toBe('/');
  });

  it('shows a failure message and reports connect errors', async () => {
    const onConnectError = jest.fn();
    const { findByText } = await render(
      <FolderBrowserModal
        initialPath="/"
        isVisible
        openSession={() => {
          return Promise.reject(new Error('Handshake failed'));
        }}
        onCancel={jest.fn()}
        onConnectError={onConnectError}
        onSelect={jest.fn()}
      />
    );
    expect(await findByText('Connection failed: Handshake failed')).toBeTruthy();
    expect(onConnectError).toHaveBeenCalledTimes(1);
  });

  it('navigates into a folder and back to the parent', async () => {
    const browse = createScriptedBrowse({
      '/home': ['user'],
      '/home/user': ['projects'],
    });
    const { findByText, getByLabelText, getByTestId } = await render(
      <FolderBrowserModal
        initialPath="/home"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    await fireEvent.press(await findByText('user'));
    expect(getByTestId('folder-browser-current-path').props.children).toBe('/home/user');
    expect(await findByText('projects')).toBeTruthy();

    await fireEvent.press(getByLabelText('Go to parent folder'));
    expect(getByTestId('folder-browser-current-path').props.children).toBe('/home');
    expect(browse.listCalls).toEqual(['/home', '/home/user', '/home']);
  });

  it('keeps the current path and shows an error when a listing fails', async () => {
    const browse = createScriptedBrowse({
      '/home': ['user'],
      '/home/user': new Error('Permission denied'),
    });
    const { findByText } = await render(
      <FolderBrowserModal
        initialPath="/home"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    await fireEvent.press(await findByText('user'));
    expect(await findByText('Could not list /home/user: Permission denied')).toBeTruthy();
  });

  it('selects the current path and cancels via the action buttons', async () => {
    const onSelect = jest.fn();
    const onCancel = jest.fn();
    const browse = createScriptedBrowse({ '/home': ['user'] });
    const { findByText, getByText } = await render(
      <FolderBrowserModal
        initialPath="/home"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={onCancel}
        onSelect={onSelect}
      />
    );
    await findByText('user');

    await fireEvent.press(getByText('Use this folder'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('/home');

    await fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disconnects the browse session when closed', async () => {
    const browse = createScriptedBrowse({ '/': ['home'] });
    const { findByText, rerender } = await render(
      <FolderBrowserModal
        initialPath="/"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    await findByText('home');

    await act(async () => {
      rerender(
        <FolderBrowserModal
          initialPath="/"
          isVisible={false}
          openSession={() => {
            return Promise.resolve(browse.session);
          }}
          onCancel={jest.fn()}
          onSelect={jest.fn()}
        />
      );
    });
    expect(browse.disconnectCount()).toBe(1);
  });

  it('hides dot folders by default and toggles them with the checkbox control', async () => {
    const browse = createScriptedBrowse({ '/home': ['.config', 'projects'] });
    const { findByText, getByLabelText, queryByText } = await render(
      <FolderBrowserModal
        initialPath="/home"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    expect(await findByText('projects')).toBeTruthy();
    expect(queryByText('.config')).toBeNull();

    await fireEvent.press(getByLabelText('Show dot folders'));
    expect(await findByText('.config')).toBeTruthy();

    await fireEvent.press(getByLabelText('Show dot folders'));
    expect(queryByText('.config')).toBeNull();
  });

  it('keeps the dot folders toggle while navigating between folders', async () => {
    const browse = createScriptedBrowse({
      '/home': ['.ssh', 'user'],
      '/home/user': ['.cache'],
    });
    const { findByText, getByLabelText, getByText, queryByText } = await render(
      <FolderBrowserModal
        initialPath="/home"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    await findByText('user');
    await fireEvent.press(getByLabelText('Show dot folders'));
    expect(await findByText('.ssh')).toBeTruthy();

    await fireEvent.press(getByText('user'));
    expect(await findByText('.cache')).toBeTruthy();
    expect(queryByText('.ssh')).toBeNull();
  });

  it('resets the dot folders toggle when reopened', async () => {
    const browse = createScriptedBrowse({ '/home': ['.config', 'projects'] });
    const { findByText, getByLabelText, queryByText, rerender } = await render(
      <FolderBrowserModal
        initialPath="/home"
        isVisible
        openSession={() => {
          return Promise.resolve(browse.session);
        }}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    await findByText('projects');
    await fireEvent.press(getByLabelText('Show dot folders'));
    expect(await findByText('.config')).toBeTruthy();

    await act(async () => {
      rerender(
        <FolderBrowserModal
          initialPath="/home"
          isVisible={false}
          openSession={() => {
            return Promise.resolve(browse.session);
          }}
          onCancel={jest.fn()}
          onSelect={jest.fn()}
        />
      );
    });
    await act(async () => {
      rerender(
        <FolderBrowserModal
          initialPath="/home"
          isVisible
          openSession={() => {
            return Promise.resolve(browse.session);
          }}
          onCancel={jest.fn()}
          onSelect={jest.fn()}
        />
      );
    });

    expect(await findByText('projects')).toBeTruthy();
    expect(queryByText('.config')).toBeNull();
  });
});
