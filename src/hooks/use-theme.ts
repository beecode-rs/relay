import { Colors } from '@/constants/theme';
import { useOptionalThemePreference } from '@/components/theme/theme-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const themePreference = useOptionalThemePreference();
  const systemScheme = useColorScheme();
  const scheme = themePreference?.effectiveScheme ?? (systemScheme === 'dark' ? 'dark' : 'light');

  return Colors[scheme];
}
