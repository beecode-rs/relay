import type { ComponentRef, RefObject } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';

import { constant } from '@/constants/constant';
import { modifierInput } from '@/features/terminal/modifier-input';
import type { TerminalModifierName } from '@/features/terminal/modifier-input';

export type TerminalInputRef = ComponentRef<typeof TextInput>;



const RETURN_KEY_TYPE = Platform.select({
  android: 'none',
  default: 'default',
} as const);

export type HiddenKeyboardInputProps = {
  armedModifier: TerminalModifierName | null;
  inputRef?: RefObject<TerminalInputRef | null>;
  onModifierUsed(): void;
  onWrite(sequence: string): void;
};

type SentinelDiff = { appended: string; removedCount: number };

const diffAgainstSentinel = (next: string): SentinelDiff => {
  const withoutSentinel = next.split(constant.keyboard.sentinel).join('');
  if (withoutSentinel.length > 0) {
    return { appended: withoutSentinel.split('\n').join('\r'), removedCount: 0 };
  }
  return { appended: '', removedCount: Math.max(0, constant.keyboard.sentinel.length - next.length) };
};

export function HiddenKeyboardInput({
  armedModifier,
  inputRef,
  onModifierUsed,
  onWrite,
}: HiddenKeyboardInputProps) {
  const writeCharacters = (chars: string) => {
    if (armedModifier === null) {
      onWrite(chars);
      return;
    }
    onWrite(modifierInput.composeSequence({ modifier: armedModifier, sequence: chars[0] }) + chars.slice(1));
    onModifierUsed();
  };

  const handleChangeText = (next: string) => {
    const diff = diffAgainstSentinel(next);
    if (diff.appended.length > 0) {
      writeCharacters(diff.appended);
    }
    if (diff.removedCount > 0) {
      onWrite('\x7f'.repeat(diff.removedCount));
    }
  };

  const handleSubmitEditing = () => {
    onWrite('\r');
  };

  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      caretHidden
      contextMenuHidden
      multiline
      onChangeText={handleChangeText}
      onSubmitEditing={handleSubmitEditing}
      ref={inputRef}
      returnKeyType={RETURN_KEY_TYPE}
      spellCheck={false}
      submitBehavior="newline"
      style={styles.input}
      value={constant.keyboard.sentinel}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 1,
    height: 1,
    opacity: 0,
    paddingVertical: 0,
  },
});
