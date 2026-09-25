import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type ThemedTextInputProps = TextInputProps;

export function ThemedTextInput({ style, ...rest }: ThemedTextInputProps) {
  const theme = useTheme();

  return (
    <TextInput
      cursorColor={theme.text}
      placeholderTextColor={theme.textSecondary}
      selectionColor={theme.backgroundSelected}
      style={[styles.input, { borderColor: theme.textSecondary, color: theme.text }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
