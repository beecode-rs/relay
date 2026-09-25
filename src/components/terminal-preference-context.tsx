import { type JSX, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { TerminalPreference, TerminalPreferenceStorage } from '@/services/terminal/terminal-preference';
import { DEFAULT_TERMINAL_PREFERENCE } from '@/services/terminal/terminal-preference';
import { TerminalPreferenceService } from '@/services/terminal/terminal-preference-service';
import { terminalPreferenceStorage } from '@/services/terminal/terminal-preference-store';

interface TerminalPreferenceContextValue {
  preference: TerminalPreference;
  savePreference: (preference: TerminalPreference) => Promise<void>;
}

const TerminalPreferenceContext = createContext<TerminalPreferenceContextValue | undefined>(undefined);

type TerminalPreferenceProviderProps = {
  children: ReactNode;
  storage?: TerminalPreferenceStorage;
};

export const TerminalPreferenceProvider = ({
  children,
  storage = terminalPreferenceStorage,
}: TerminalPreferenceProviderProps): JSX.Element => {
  const [preference, setPreference] = useState<TerminalPreference>(DEFAULT_TERMINAL_PREFERENCE);
  const terminalPreferenceService = useMemo(() => {
    return new TerminalPreferenceService();
  }, []);

  useEffect(() => {
    void terminalPreferenceService.loadPreference({ storage }).then((loadedPreference) => {
      setPreference(loadedPreference);
    });
  }, [terminalPreferenceService, storage]);

  const contextValue = useMemo(() => {
    return {
      preference,
      savePreference: (nextPreference: TerminalPreference) => {
        return terminalPreferenceService
          .savePreference({ preference: nextPreference, storage })
          .then(() => {
            setPreference(nextPreference);
          });
      },
    };
  }, [preference, terminalPreferenceService, storage]);

  return <TerminalPreferenceContext.Provider value={contextValue}>{children}</TerminalPreferenceContext.Provider>;
};

export const useOptionalTerminalPreference = (): TerminalPreferenceContextValue | undefined => {
  return useContext(TerminalPreferenceContext);
};

export const useTerminalPreference = (): TerminalPreferenceContextValue => {
  const contextValue = useContext(TerminalPreferenceContext);

  if (!contextValue) {
    throw new Error('useTerminalPreference requires TerminalPreferenceProvider');
  }

  return contextValue;
};
