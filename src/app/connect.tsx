import { useLocalSearchParams } from 'expo-router';

import { ServerFormScreen } from '@/features/servers/server-form-screen';

const firstParam = (value: string | string[] | undefined): string | undefined => {
  return Array.isArray(value) ? value[0] : value;
};

export default function Connect() {
  const { cloneId, id } = useLocalSearchParams<{ cloneId?: string; id?: string }>();
  const profileId = firstParam(id);
  const cloneSourceId = firstParam(cloneId);

  return <ServerFormScreen cloneSourceId={cloneSourceId} profileId={profileId} />;
}
