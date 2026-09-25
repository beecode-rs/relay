import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';

import { constant } from '@/constants/constant';


export const useAppFonts = (): { isFontsLoaded: boolean } => {
  const [isFontsLoaded] = useFonts({
    [constant.font.monoBoldFamily]: JetBrainsMono_700Bold,
    [constant.font.monoRegularFamily]: JetBrainsMono_400Regular,
  });

  return { isFontsLoaded };
};
