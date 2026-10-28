import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { RefObject } from 'react';
import { Platform } from 'react-native';

import { constant } from '@/constants/constant';
import { HiddenKeyboardInput } from '@/features/terminal/hidden-keyboard-input';
import type { HiddenKeyboardInputProps, TerminalKeyboardBuffer } from '@/features/terminal/hidden-keyboard-input';

type MountedInput = {
  onModifierUsed: jest.Mock;
  onWrite: jest.Mock;
  rerenderInput(props: Partial<HiddenKeyboardInputProps>): Promise<void>;
};

const renderInput = async (props: Partial<HiddenKeyboardInputProps> = {}): Promise<MountedInput> => {
  const onModifierUsed = jest.fn();
  const onWrite = jest.fn();
  const elementFor = (next: Partial<HiddenKeyboardInputProps>) => (
    <HiddenKeyboardInput
      armedModifier={null}
      onModifierUsed={onModifierUsed}
      onWrite={onWrite}
      {...next}
    />
  );
  const renderResult = await render(elementFor(props));
  return {
    onModifierUsed,
    onWrite,
    rerenderInput: async (next: Partial<HiddenKeyboardInputProps>) => {
      await renderResult.rerender(elementFor({ ...props, ...next }));
    },
  };
};

const input = (value: string = constant.keyboard.sentinel) => {
  return screen.getByDisplayValue(value);
};

describe('HiddenKeyboardInput', () => {
  it('keeps the sentinel as the pinned value', async () => {
    await renderInput();
    expect(input().props.value).toBe(constant.keyboard.sentinel);
    expect(constant.keyboard.sentinel).toBe('\u200b');
  });

  it('writes appended characters from the sentinel diff', async () => {
    const { onWrite } = await renderInput();
    await fireEvent.changeText(input(), `${constant.keyboard.sentinel}a`);
    expect(onWrite).toHaveBeenLastCalledWith('a');
    await fireEvent.changeText(input(), `${constant.keyboard.sentinel}bc`);
    expect(onWrite).toHaveBeenLastCalledWith('bc');
  });

  it('writes a backspace for each removed sentinel character', async () => {
    const { onWrite } = await renderInput();
    await fireEvent.changeText(input(), '');
    expect(onWrite).toHaveBeenLastCalledWith('\x7f');
  });

  it('maps newlines from the multiline return key to carriage returns', async () => {
    const { onWrite } = await renderInput();
    await fireEvent.changeText(input(), `${constant.keyboard.sentinel}a\nb`);
    expect(onWrite).toHaveBeenLastCalledWith('a\rb');
    await fireEvent.changeText(input(), `${constant.keyboard.sentinel}\n`);
    expect(onWrite).toHaveBeenLastCalledWith('\r');
  });

  it('shows the keyboard return key instead of an action button', async () => {
    await renderInput();
    expect(input().props.multiline).toBe(true);
    expect(input().props.submitBehavior).toBe('newline');
    expect(['none', 'default']).toContain(input().props.returnKeyType);
  });

  it('ignores autocorrect by default', async () => {
    await renderInput();
    expect(input().props.autoCorrect).toBe(false);
    expect(input().props.spellCheck).toBe(false);
    expect(input().props.keyboardType).toBe(Platform.OS === 'android' ? 'visible-password' : undefined);
    expect(input().props.importantForAutofill).toBe('no');
  });

  it('ignores autocorrect when compatibility mode is off', async () => {
    await renderInput({ isKeyboardCompatibilityEnabled: false });
    expect(input().props.autoCorrect).toBe(false);
    expect(input().props.spellCheck).toBe(false);
    expect(input().props.keyboardType).toBe(Platform.OS === 'android' ? 'visible-password' : undefined);
    expect(input().props.importantForAutofill).toBe('no');
  });

  it('enables autocorrect in keyboard compatibility mode', async () => {
    await renderInput({ isKeyboardCompatibilityEnabled: true });
    expect(input().props.autoCorrect).toBe(true);
    expect(input().props.spellCheck).toBe(true);
    expect(input().props.keyboardType).toBeUndefined();
    expect(input().props.importantForAutofill).toBeUndefined();
  });

  it('writes carriage return on submit', async () => {
    const { onWrite } = await renderInput();
    await fireEvent(input(), 'submitEditing');
    expect(onWrite).toHaveBeenLastCalledWith('\r');
  });

  it('applies an armed ctrl modifier to the first typed character and disarms', async () => {
    const { onModifierUsed, onWrite } = await renderInput({ armedModifier: 'ctrl' });
    await fireEvent.changeText(input(), `${constant.keyboard.sentinel}cd`);
    expect(onWrite).toHaveBeenLastCalledWith('\x03d');
    expect(onModifierUsed).toHaveBeenCalledTimes(1);
  });

  it('applies an armed alt modifier to the first typed character and disarms', async () => {
    const { onModifierUsed, onWrite } = await renderInput({ armedModifier: 'alt' });
    await fireEvent.changeText(input(), `${constant.keyboard.sentinel}x`);
    expect(onWrite).toHaveBeenLastCalledWith('\x1bx');
    expect(onModifierUsed).toHaveBeenCalledTimes(1);
  });

  it('does not consume the modifier on pure backspace events', async () => {
    const { onModifierUsed, onWrite } = await renderInput({ armedModifier: 'ctrl' });
    await fireEvent.changeText(input(), '');
    expect(onWrite).toHaveBeenLastCalledWith('\x7f');
    expect(onModifierUsed).not.toHaveBeenCalled();
  });

  it('ignores no-op changes that only re-report the sentinel', async () => {
    const { onWrite } = await renderInput();
    await fireEvent.changeText(input(), constant.keyboard.sentinel);
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('collapses the android edit-text footprint below its minimum height', async () => {
    await renderInput();
    const style = input().props.style;
    expect(style.fontSize).toBe(1);
    expect(style.height).toBe(1);
    expect(style.paddingVertical).toBe(0);
  });

  describe('compatibility mode word buffer', () => {
    it('keeps the word being typed in the field instead of writing it', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      expect(onWrite).not.toHaveBeenCalled();
      expect(input(`${constant.keyboard.sentinel}gi`).props.value).toBe(`${constant.keyboard.sentinel}gi`);
    });

    it('writes the word once a space completes it and keeps the field verbatim', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}git `);
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(onWrite).toHaveBeenCalledWith('git ');
      // The completed word stays in the field: shrinking it programmatically
      // is what ends an active dictation session.
      expect(input(`${constant.keyboard.sentinel}git `).props.value).toBe(`${constant.keyboard.sentinel}git `);
    });

    it('keeps only the trailing word pending after a completed word', async () => {
      const onDraftChange = jest.fn();
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true, onDraftChange });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}git sta`);
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(onWrite).toHaveBeenCalledWith('git ');
      expect(input(`${constant.keyboard.sentinel}git sta`).props.value).toBe(
        `${constant.keyboard.sentinel}git sta`
      );
      expect(onDraftChange).toHaveBeenLastCalledWith('sta');
    });

    it('writes a suggestion replacement when the keyboard completes the word', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}helo`);
      expect(onWrite).not.toHaveBeenCalled();
      // Suggestion taps land as the corrected word plus a trailing space.
      await fireEvent.changeText(input(`${constant.keyboard.sentinel}helo`), `${constant.keyboard.sentinel}hello `);
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(onWrite).toHaveBeenCalledWith('hello ');
    });

    it('keeps a dictated phrase flowing by echoing interim text verbatim', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}hello `);
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(onWrite).toHaveBeenLastCalledWith('hello ');
      expect(input(`${constant.keyboard.sentinel}hello `).props.value).toBe(
        `${constant.keyboard.sentinel}hello `
      );

      await fireEvent.changeText(
        input(`${constant.keyboard.sentinel}hello `),
        `${constant.keyboard.sentinel}hello world`
      );
      // The trailing word stays pending until its delimiter arrives.
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(input(`${constant.keyboard.sentinel}hello world`).props.value).toBe(
        `${constant.keyboard.sentinel}hello world`
      );

      await fireEvent.changeText(
        input(`${constant.keyboard.sentinel}hello world`),
        `${constant.keyboard.sentinel}hello world `
      );
      expect(onWrite).toHaveBeenCalledTimes(2);
      expect(onWrite).toHaveBeenLastCalledWith('world ');
    });

    it('erases already-sent text when a rewrite shortens the phrase', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}abcd `);
      expect(onWrite).toHaveBeenCalledWith('abcd ');
      await fireEvent.changeText(input(`${constant.keyboard.sentinel}abcd `), `${constant.keyboard.sentinel}ab`);
      expect(onWrite).toHaveBeenLastCalledWith('\x7f\x7f\x7f');
    });

    it('corrects already-sent words when dictation rewrites the phrase', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      // A dictated phrase lands as one batched change and flushes in one write.
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}hello world `);
      expect(onWrite.mock.calls).toEqual([['hello world ']]);
      // The dictation finalization rewrites the phrase with punctuation.
      await fireEvent.changeText(
        input(`${constant.keyboard.sentinel}hello world `),
        `${constant.keyboard.sentinel}hello, world `
      );
      expect(onWrite.mock.calls.slice(1)).toEqual([['\x7f'.repeat(7)], [', world ']]);
    });

    it('does not write when backspacing inside the buffered word', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      await fireEvent.changeText(input(`${constant.keyboard.sentinel}gi`), `${constant.keyboard.sentinel}g`);
      await fireEvent.changeText(input(`${constant.keyboard.sentinel}g`), constant.keyboard.sentinel);
      expect(onWrite).not.toHaveBeenCalled();
      await fireEvent.changeText(input(), '');
      expect(onWrite).toHaveBeenCalledWith('\x7f');
    });

    it('maps buffered newlines to carriage returns when the word flushes', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}git\n`);
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(onWrite).toHaveBeenCalledWith('git\r');
    });

    it('flushes the buffered word before the submit carriage return', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      await fireEvent(input(`${constant.keyboard.sentinel}gi`), 'submitEditing');
      expect(onWrite.mock.calls).toEqual([['gi'], ['\r']]);
      // The return key is the one moment the field may shrink again.
      expect(input().props.value).toBe(constant.keyboard.sentinel);
    });

    it('flushes the buffered word when a modifier is armed', async () => {
      const mounted = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      await mounted.rerenderInput({ armedModifier: 'ctrl' });
      expect(mounted.onWrite).toHaveBeenCalledWith('gi');
      // The field keeps its text so an active dictation session survives.
      expect(input(`${constant.keyboard.sentinel}gi`).props.value).toBe(`${constant.keyboard.sentinel}gi`);
    });

    it('writes modifier chords immediately without buffering', async () => {
      const { onModifierUsed, onWrite } = await renderInput({
        armedModifier: 'ctrl',
        isKeyboardCompatibilityEnabled: true,
      });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}c`);
      expect(onWrite).toHaveBeenCalledWith('\x03');
      expect(onModifierUsed).toHaveBeenCalledTimes(1);
      expect(input(`${constant.keyboard.sentinel}c`).props.value).toBe(`${constant.keyboard.sentinel}c`);
    });

    it('flushes the buffered word through the exposed buffer handle', async () => {
      const bufferRef: RefObject<TerminalKeyboardBuffer | null> = { current: null };
      const { onWrite } = await renderInput({ bufferRef, isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      await act(async () => {
        bufferRef.current?.flush();
      });
      expect(onWrite).toHaveBeenCalledTimes(1);
      expect(onWrite).toHaveBeenCalledWith('gi');
      expect(input(`${constant.keyboard.sentinel}gi`).props.value).toBe(`${constant.keyboard.sentinel}gi`);
      await act(async () => {
        bufferRef.current?.flush();
      });
      expect(onWrite).toHaveBeenCalledTimes(1);
    });

    it('flushes the buffered word when compatibility mode turns off', async () => {
      const mounted = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      await mounted.rerenderInput({ isKeyboardCompatibilityEnabled: false });
      expect(mounted.onWrite).toHaveBeenCalledWith('gi');
    });

    it('replaces typographic autocorrect characters with ASCII equivalents', async () => {
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}don\u2019t\u00a0`);
      expect(onWrite).toHaveBeenCalledWith("don't ");
    });

    it('reports draft changes so the screen can preview the buffered word', async () => {
      const onDraftChange = jest.fn();
      const { onWrite } = await renderInput({ isKeyboardCompatibilityEnabled: true, onDraftChange });
      await fireEvent.changeText(input(), `${constant.keyboard.sentinel}gi`);
      expect(onDraftChange).toHaveBeenLastCalledWith('gi');
      await fireEvent.changeText(input(`${constant.keyboard.sentinel}gi`), `${constant.keyboard.sentinel}git `);
      expect(onWrite).toHaveBeenCalledWith('git ');
      expect(onDraftChange).toHaveBeenLastCalledWith('');
    });
  });
});
