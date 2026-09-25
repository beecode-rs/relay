import { useSyncExternalStore } from 'react';

const darkModeMediaQuery = '(prefers-color-scheme: dark)';

function subscribe(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(darkModeMediaQuery);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => {
    mediaQuery.removeEventListener('change', onStoreChange);
  };
}

function getSnapshot(): 'light' | 'dark' {
  if (window.matchMedia(darkModeMediaQuery).matches) {
    return 'dark';
  }
  return 'light';
}

function getServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
