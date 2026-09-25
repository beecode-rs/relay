import { type JSX } from 'react';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';

export type DeviceKeyRenameDialogProps = {
  isVisible: boolean;
  isBusy: boolean;
  name: string;
  onNameChange(value: string): void;
  onCancel(): void;
  onConfirm(): void;
};

export const DeviceKeyRenameDialog = ({
  isVisible,
  isBusy,
  name,
  onNameChange,
  onCancel,
  onConfirm,
}: DeviceKeyRenameDialogProps): JSX.Element => {
  const isConfirmDisabled = isBusy || name.trim() === '';

  return (
    <Portal>
      <Dialog onDismiss={onCancel} visible={isVisible}>
        <Dialog.Title>Rename device key</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall">This is the name servers show for this key in authorized_keys.</Text>
          <TextInput
            autoFocus
            onChangeText={onNameChange}
            placeholder="relay-beecode@my-iphone-ios"
            testID="device-key-rename-input"
            value={name}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button disabled={isConfirmDisabled} onPress={onConfirm} testID="device-key-rename-confirm">
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};
