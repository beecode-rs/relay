import { useLocalSearchParams } from 'expo-router';

import { TerminalScreen } from '@/features/terminal/terminal-screen';

export default function Terminal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const profileId = Array.isArray(id) ? id[0] : id;

  return <TerminalScreen profileId={profileId} />;
}
