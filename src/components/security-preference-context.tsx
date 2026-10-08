import { type JSX, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { SecurityPreference, SecurityPreferenceStorage } from '@/services/security/security-preference';
import { DEFAULT_SECURITY_PREFERENCE } from '@/services/security/security-preference';
import { SecurityPreferenceService } from '@/services/security/security-preference-service';
import { securityPreferenceStorage } from '@/services/security/security-preference-store';

interface SecurityPreferenceContextValue {
  isLoaded: boolean;
  preference: SecurityPreference;
  savePreference: (preference: SecurityPreference) => Promise<void>;
}

const SecurityPreferenceContext = createContext<SecurityPreferenceContextValue | undefined>(undefined);

type SecurityPreferenceProviderProps = {
  children: ReactNode;
  storage?: SecurityPreferenceStorage;
};

export const SecurityPreferenceProvider = ({
  children,
  storage = securityPreferenceStorage,
}: SecurityPreferenceProviderProps): JSX.Element => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [preference, setPreference] = useState<SecurityPreference>(DEFAULT_SECURITY_PREFERENCE);
  const securityPreferenceService = useMemo(() => {
    return new SecurityPreferenceService();
  }, []);

  useEffect(() => {
    void securityPreferenceService
      .loadPreference({ storage })
      .then((loadedPreference) => {
        setPreference(loadedPreference);
      })
      .catch(() => {
        setPreference(DEFAULT_SECURITY_PREFERENCE);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, [securityPreferenceService, storage]);

  const contextValue = useMemo(() => {
    return {
      isLoaded,
      preference,
      savePreference: (nextPreference: SecurityPreference) => {
        return securityPreferenceService.savePreference({ preference: nextPreference, storage }).then(() => {
          setPreference(nextPreference);
        });
      },
    };
  }, [isLoaded, preference, securityPreferenceService, storage]);

  return <SecurityPreferenceContext.Provider value={contextValue}>{children}</SecurityPreferenceContext.Provider>;
};

export const useOptionalSecurityPreference = (): SecurityPreferenceContextValue | undefined => {
  return useContext(SecurityPreferenceContext);
};

export const useSecurityPreference = (): SecurityPreferenceContextValue => {
  const contextValue = useContext(SecurityPreferenceContext);

  if (!contextValue) {
    throw new Error('useSecurityPreference requires SecurityPreferenceProvider');
  }

  return contextValue;
};
