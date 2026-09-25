import { type JSX } from 'react';
import { IconButton as PaperIconButton } from 'react-native-paper';

export type IconButtonProps = {
  disabled?: boolean;
  icon: string;
  iconColor?: string;
  onPress: () => void;
  size?: number;
  testID?: string;
  tip: string;
}

export const IconButton = ({ disabled, icon, iconColor, onPress, size, testID, tip }: IconButtonProps): JSX.Element => {
  return (
    <PaperIconButton
      accessibilityLabel={tip}
      disabled={disabled}
      icon={icon}
      iconColor={iconColor}
      onPress={onPress}
      size={size}
      testID={testID}
    />
  );
};
