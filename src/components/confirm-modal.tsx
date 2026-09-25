import { type JSX } from 'react';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

import { useThemePreference } from '@/components/theme/theme-context';

interface ConfirmModalProps {
  confirmLabel: string;
  isDestructive?: boolean;
  isVisible: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}

export const ConfirmModal = ({
  confirmLabel,
  isDestructive,
  isVisible,
  message,
  onCancel,
  onConfirm,
  title,
}: ConfirmModalProps): JSX.Element => {
  const { md3Theme } = useThemePreference();

  const resolveConfirmTextColor = (): string => {
    if (isDestructive) {
      return md3Theme.colors.error;
    }

    return md3Theme.colors.primary;
  };

  return (
    <Portal>
      <Dialog onDismiss={onCancel} visible={isVisible}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button onPress={onConfirm} textColor={resolveConfirmTextColor()}>
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};
