import { type Theme } from 'expo-router';
import { type JSX, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { type MD3Theme } from 'react-native-paper';

import { effectiveThemeUtil } from '@/components/theme/effective-theme';
import type {
  EffectiveThemeScheme,
  ThemePreference,
  ThemePreferenceStorage,
} from '@/services/theme/theme-preference';
import { ThemePreferenceService } from '@/services/theme/theme-preference-service';
import { themePreferenceStorage } from '@/services/theme/theme-preference-store';

interface ThemePreferenceContextValue {
  effectiveScheme: EffectiveThemeScheme;
  md3Theme: MD3Theme;
  navigationTheme: Theme;
  preference: ThemePreference;
  savePreference: (preference: ThemePreference) => Promise<void>;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | undefined>(undefined);

type ThemePreferenceProviderProps = {
  children: ReactNode;
  storage?: ThemePreferenceStorage;
};

export const ThemePreferenceProvider = ({ children, storage = themePreferenceStorage }: ThemePreferenceProviderProps): JSX.Element | null => {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>({ scheme: 'system' });
  const themePreferenceService = useMemo(() => {
    return new ThemePreferenceService();
  }, []);

  useEffect(() => {
    void themePreferenceService.loadPreference({ storage }).then((loadedPreference) => {
      setPreference(loadedPreference);
    });
  }, [themePreferenceService, storage]);

  const effectiveScheme = themePreferenceService.resolveScheme({ scheme: preference.scheme, systemScheme });
  const md3Theme = useMemo(() => {
    return effectiveThemeUtil.resolveMd3Theme({ scheme: effectiveScheme });
  }, [effectiveScheme]);
  const navigationTheme = useMemo(() => {
    return effectiveThemeUtil.resolveNavigationTheme({ md3Theme, scheme: effectiveScheme });
  }, [md3Theme, effectiveScheme]);
  const contextValue = useMemo(() => {
    return {
      effectiveScheme,
      md3Theme,
      navigationTheme,
      preference,
      savePreference: (nextPreference: ThemePreference) => {
        return themePreferenceService
          .savePreference({ preference: nextPreference, storage })
          .then(() => {
            setPreference(nextPreference);
          });
      },
    };
  }, [effectiveScheme, md3Theme, navigationTheme, preference, themePreferenceService, storage]);

  return <ThemePreferenceContext.Provider value={contextValue}>{children}</ThemePreferenceContext.Provider>;
};

export const useOptionalThemePreference = (): ThemePreferenceContextValue | undefined => {
  return useContext(ThemePreferenceContext);
};

export const useThemePreference = (): ThemePreferenceContextValue => {
  const contextValue = useContext(ThemePreferenceContext);

  if (!contextValue) {
    throw new Error('useThemePreference requires ThemePreferenceProvider');
  }

  return contextValue;
};
