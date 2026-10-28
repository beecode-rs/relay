import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';

import { constant } from '@/constants/constant';
import { modifierInput } from '@/features/terminal/modifier-input';
import type { TerminalModifierName } from '@/features/terminal/modifier-input';

export type TerminalInputRef = ComponentRef<typeof TextInput>;

/**
 * Imperative handle for the compatibility-mode word buffer. Extra keys and
 * other direct writers flush any pending word before their own write so the
 * terminal keeps receiving keys in the order they were typed.
 */
export type TerminalKeyboardBuffer = {
  flush(): void;
};



const RETURN_KEY_TYPE = Platform.select({
  android: 'none',
  default: 'default',
} as const);

const KEYBOARD_TYPE = Platform.select({
  android: 'visible-password',
  default: undefined,
} as const);

export type HiddenKeyboardInputProps = {
  armedModifier: TerminalModifierName | null;
  bufferRef?: RefObject<TerminalKeyboardBuffer | null>;
  inputRef?: RefObject<TerminalInputRef | null>;
  isKeyboardCompatibilityEnabled?: boolean;
  onDraftChange?(draft: string): void;
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

// Autocorrect, suggestion taps and dictation insert typographic characters a
// shell cannot use (curly quotes, dashes, non-breaking spaces); compatibility
// mode trades them for their ASCII equivalents when text goes to the terminal.
const TYPOGRAPHIC_REPLACEMENTS: Readonly<Record<string, string>> = {
  '\u00a0': ' ',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201b': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u2026': '...',
};

const normalizeCompatibilityText = (text: string): string => {
  return text.replace(/[\u00a0\u2013-\u2015\u2018\u2019\u201b\u201c-\u201e\u2026]/g, (character) => {
    return TYPOGRAPHIC_REPLACEMENTS[character] ?? character;
  });
};

// Everything through the last delimiter is finished typing. iOS pads
// suggestions and dictated words with a non-breaking space, so it delimits a
// word just like a plain space does.
const lastDelimiterIndexOf = (text: string): number => {
  return Math.max(text.lastIndexOf(' '), text.lastIndexOf('\n'), text.lastIndexOf('\u00a0'));
};

const commonPrefixLengthOf = (a: string, b: string): number => {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
};

export function HiddenKeyboardInput({
  armedModifier,
  bufferRef,
  inputRef,
  isKeyboardCompatibilityEnabled,
  onDraftChange,
  onModifierUsed,
  onWrite,
}: HiddenKeyboardInputProps) {
  // Compatibility mode keeps everything the keyboard has produced in the
  // field - echoed back verbatim, because React Native skips the native text
  // update when the value matches and a programmatic change is what ends an
  // active dictation session mid-word. `sentLength` tracks how much of that
  // text already reached the terminal; the field itself only shrinks from the
  // return key, never while the IME is composing. Text left behind after a
  // flush counts as sent, so backspacing over it deletes terminal characters.
  const [fieldText, setFieldText] = useState('');
  const fieldTextRef = useRef('');
  const sentLengthRef = useRef(0);
  const onWriteRef = useRef(onWrite);
  const onDraftChangeRef = useRef(onDraftChange);

  // Keep the latest callbacks reachable from stable functions. Declared first
  // so it runs before the effects below that may flush on the same commit.
  useEffect(() => {
    onWriteRef.current = onWrite;
    onDraftChangeRef.current = onDraftChange;
  }, [onWrite, onDraftChange]);

  // Echo the OS text verbatim and publish the unsent tail as the on-screen
  // preview.
  const applyField = useCallback((raw: string) => {
    fieldTextRef.current = raw;
    setFieldText(raw);
    onDraftChangeRef.current?.(normalizeCompatibilityText(raw.slice(sentLengthRef.current)));
  }, []);

  const writeCharacters = (chars: string) => {
    if (armedModifier === null) {
      onWrite(chars);
      return;
    }
    onWrite(modifierInput.composeSequence({ modifier: armedModifier, sequence: chars[0] }) + chars.slice(1));
    onModifierUsed();
  };

  // Sends any unsent tail so a following write lands behind it in typed order.
  // Deliberately keeps the field text untouched: shrinking the field
  // programmatically is what ends an active dictation session, so the field
  // only ever shrinks from a user action (the return key). Text that stays
  // behind is already sent, so backspacing over it deletes terminal
  // characters - exactly like typed text.
  const flushPending = useCallback(() => {
    const pending = fieldTextRef.current.slice(sentLengthRef.current);
    if (pending.length === 0) {
      return;
    }
    sentLengthRef.current = fieldTextRef.current.length;
    onWriteRef.current(normalizeCompatibilityText(pending).split('\n').join('\r'));
    onDraftChangeRef.current?.('');
  }, []);

  const handleCompatibilityChangeText = (next: string) => {
    const raw = next.split(constant.keyboard.sentinel).join('');
    const previousRaw = fieldTextRef.current;

    // Deletions or rewrites that reach into already-sent text erase the
    // difference on the terminal (a dictation finalization can rewrite whole
    // phrases); edits inside the pending tail were never sent, so they are
    // free.
    if (raw !== previousRaw) {
      const commonPrefix = commonPrefixLengthOf(raw, previousRaw);
      if (commonPrefix < sentLengthRef.current) {
        onWrite('\x7f'.repeat(sentLengthRef.current - commonPrefix));
        sentLengthRef.current = commonPrefix;
      }
    }

    if (raw.length === 0) {
      // Backspaces past the buffer eat the sentinel and reach the terminal.
      const removedCount = Math.max(0, constant.keyboard.sentinel.length - next.length);
      if (removedCount > 0) {
        onWrite('\x7f'.repeat(removedCount));
      }
      applyField('');
      return;
    }

    if (armedModifier !== null) {
      // Modifier chords are deliberate single-key actions; they must not sit
      // in a word buffer waiting for a space.
      const chordTail = raw.slice(sentLengthRef.current);
      if (chordTail.length > 0) {
        writeCharacters(normalizeCompatibilityText(chordTail).split('\n').join('\r'));
        sentLengthRef.current = raw.length;
      }
      applyField(raw);
      return;
    }

    // Words completed since the last flush go out immediately; the trailing
    // word stays pending (and previewed) until a delimiter finishes it too.
    // The field keeps the text verbatim so dictation keeps running.
    const sent = sentLengthRef.current;
    if (raw.length > sent) {
      const tail = raw.slice(sent);
      const lastDelimiter = lastDelimiterIndexOf(tail);
      if (lastDelimiter !== -1) {
        writeCharacters(
          normalizeCompatibilityText(tail.slice(0, lastDelimiter + 1)).split('\n').join('\r')
        );
        sentLengthRef.current = sent + lastDelimiter + 1;
      }
    }
    applyField(raw);
  };

  const handleChangeText = (next: string) => {
    if (isKeyboardCompatibilityEnabled === true) {
      handleCompatibilityChangeText(next);
      return;
    }
    const diff = diffAgainstSentinel(next);
    if (diff.appended.length > 0) {
      writeCharacters(diff.appended);
    }
    if (diff.removedCount > 0) {
      onWrite('\x7f'.repeat(diff.removedCount));
    }
  };

  const handleSubmitEditing = () => {
    if (isKeyboardCompatibilityEnabled === true) {
      flushPending();
      // The return key is a deliberate user action, so it is the one moment
      // the field may shrink back to the bare sentinel.
      sentLengthRef.current = 0;
      applyField('');
    }
    onWrite('\r');
  };

  // An armed modifier consumes the very next key, so finish the buffered word
  // first; otherwise a chord like ctrl+c would land behind a pending word.
  useEffect(() => {
    if (armedModifier !== null) {
      flushPending();
    }
  }, [armedModifier, flushPending]);

  // Mode toggle from settings: deliver whatever was buffered instead of
  // silently dropping it.
  useEffect(() => {
    flushPending();
  }, [isKeyboardCompatibilityEnabled, flushPending]);

  // Direct writers (extra keys row) flush the buffer through this handle
  // before their own write.
  useEffect(() => {
    if (bufferRef === undefined) {
      return;
    }
    bufferRef.current = { flush: flushPending };
    return () => {
      bufferRef.current = null;
    };
  }, [bufferRef, flushPending]);

  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={isKeyboardCompatibilityEnabled === true}
      caretHidden
      contextMenuHidden
      importantForAutofill={isKeyboardCompatibilityEnabled === true ? undefined : 'no'}
      key={isKeyboardCompatibilityEnabled === true ? 'keyboard-autocorrect' : 'keyboard-raw'}
      keyboardType={isKeyboardCompatibilityEnabled === true ? undefined : KEYBOARD_TYPE}
      multiline
      onChangeText={handleChangeText}
      onSubmitEditing={handleSubmitEditing}
      ref={inputRef}
      returnKeyType={RETURN_KEY_TYPE}
      spellCheck={isKeyboardCompatibilityEnabled === true}
      submitBehavior="newline"
      style={styles.input}
      value={
        isKeyboardCompatibilityEnabled === true
          ? constant.keyboard.sentinel + fieldText
          : constant.keyboard.sentinel
      }
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
