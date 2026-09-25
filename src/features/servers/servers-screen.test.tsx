import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { PaperProvider } from 'react-native-paper';

import { ThemePreferenceProvider } from '@/components/theme/theme-context';
import { ServersScreen } from '@/features/servers/servers-screen';
import type { ServerProfile } from '@/services/connection/server-profile';
import type { ServerProfileStore } from '@/services/connection/server-profile-store';
import type { ThemePreferenceStorage } from '@/services/theme/theme-preference';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  const React = require('react');

  return {
    router: { navigate: jest.fn(), push: jest.fn() },
    useFocusEffect: (callback: () => void | undefined) => {
      React.useEffect(() => {
        return callback();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mock mirrors run-once-on-focus semantics
      }, []);
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('react-native-safe-area-context/jest/mock').default;
});

jest.mock('react-native-paper', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory cannot reference out-of-scope imports
  return require('../../../jest/paper-menu-stub').createPaperModuleWithMenuStub();
});

const PROFILE_A: ServerProfile = {
  acceptedHostKeys: [],
  authMethod: 'password',
  host: 'alpha.example.com',
  id: 'server-a',
  label: 'Alpha',
  port: 22,
  tmuxPrefix: 'aaa111',
  username: 'user',
};

const PROFILE_B: ServerProfile = {
  acceptedHostKeys: [],
  authMethod: 'privateKey',
  host: 'beta.example.com',
  id: 'server-b',
  label: 'Beta',
  port: 2222,
  tmuxPrefix: 'bbb222',
  username: 'deploy',
};

const createStore = (profiles: ServerProfile[]) => {
  const store: ServerProfileStore = {
    async findById({ id }) {
      return profiles.find((profile) => {
        return profile.id === id;
      }) ?? null;
    },
    async list() {
      return [...profiles].sort((left, right) => {
        return left.label.localeCompare(right.label);
      });
    },
    async migrateLegacyProfile() {},
    async remove({ id }) {
      const index = profiles.findIndex((profile) => {
        return profile.id === id;
      });
      if (index !== -1) {
        profiles.splice(index, 1);
      }
    },
    async save({ profile }) {
      const index = profiles.findIndex((current) => {
        return current.id === profile.id;
      });
      if (index === -1) {
        profiles.push(profile);
      } else {
        profiles[index] = profile;
      }
    },
  };

  return store;
};

const createStorage = (): ThemePreferenceStorage => {
  const state = { value: null as string | null };

  return {
    async readPreference() {
      return state.value;
    },
    async writePreference(params) {
      state.value = params.value;
    },
  };
};

const renderScreen = (ui: ReactElement) => {
  return render(
    <ThemePreferenceProvider storage={createStorage()}>
      <PaperProvider>{ui}</PaperProvider>
    </ThemePreferenceProvider>,
  );
};

beforeEach(() => {
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.push).mockClear();
});

describe('ServersScreen', () => {
  it('renders the stored servers', async () => {
    await renderScreen(<ServersScreen store={createStore([PROFILE_A, PROFILE_B])} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });
    expect(screen.getByText('Relay')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText(/user@alpha\.example\.com:22/)).toBeTruthy();
    expect(screen.getByText(/deploy@beta\.example\.com:2222/)).toBeTruthy();
  });

  it('shows the empty state when no servers exist', async () => {
    await renderScreen(<ServersScreen store={createStore([])} />);

    await waitFor(() => {
      expect(screen.getByText('No servers configured yet.')).toBeTruthy();
    });
  });

  it('navigates to the terminal for the pressed server', async () => {
    await renderScreen(<ServersScreen store={createStore([PROFILE_A])} />);

    await waitFor(() => {
      expect(screen.getByTestId('server-row-server-a')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('server-row-server-a'));

    expect(router.navigate).toHaveBeenCalledWith({ params: { id: 'server-a' }, pathname: '/terminal' });
  });

  it('opens the form for editing', async () => {
    await renderScreen(<ServersScreen store={createStore([PROFILE_A])} />);

    await waitFor(() => {
      expect(screen.getByTestId('server-menu-server-a')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('server-menu-server-a'));

    await waitFor(() => {
      expect(screen.getByTestId('server-edit-server-a')).toBeTruthy();
    });
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Clone')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('server-edit-server-a'));

    expect(router.push).toHaveBeenCalledWith({ params: { id: 'server-a' }, pathname: '/connect' });
  });

  it('opens the add form prefilled from the server for cloning', async () => {
    const profiles = [PROFILE_A];
    const store = createStore(profiles);
    const saveSpy = jest.spyOn(store, 'save');

    await renderScreen(<ServersScreen store={store} />);

    await waitFor(() => {
      expect(screen.getByTestId('server-menu-server-a')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('server-menu-server-a'));

    await waitFor(() => {
      expect(screen.getByTestId('server-clone-server-a')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('server-clone-server-a'));

    expect(router.push).toHaveBeenCalledWith({ params: { cloneId: 'server-a' }, pathname: '/connect' });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('opens the form for adding', async () => {
    await renderScreen(<ServersScreen store={createStore([])} />);

    await fireEvent.press(screen.getByTestId('server-add'));

    expect(router.push).toHaveBeenCalledWith('/connect');
  });

  it('navigates to the settings from the overflow menu', async () => {
    await renderScreen(<ServersScreen store={createStore([])} />);

    await fireEvent.press(screen.getByTestId('app-top-bar-more-options'));

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('Settings'));

    expect(router.navigate).toHaveBeenCalledWith('/settings');
  });

  it('navigates to the about screen from the overflow menu', async () => {
    await renderScreen(<ServersScreen store={createStore([])} />);

    await fireEvent.press(screen.getByTestId('app-top-bar-more-options'));

    await waitFor(() => {
      expect(screen.getByText('About')).toBeTruthy();
    });
    await fireEvent.press(screen.getByText('About'));

    expect(router.push).toHaveBeenCalledWith('/about');
  });

  it('deletes a server after confirming', async () => {
    const profiles = [PROFILE_A];
    await renderScreen(<ServersScreen store={createStore(profiles)} />);

    await waitFor(() => {
      expect(screen.getByTestId('server-menu-server-a')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('server-menu-server-a'));

    await waitFor(() => {
      expect(screen.getByTestId('server-delete-server-a')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('server-delete-server-a'));

    await waitFor(() => {
      expect(screen.getByText('Delete server')).toBeTruthy();
    });
    expect(screen.getByText('Remove "Alpha" and its stored credentials?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Delete'));

    await waitFor(() => {
      expect(profiles).toHaveLength(0);
    });
  });
});
