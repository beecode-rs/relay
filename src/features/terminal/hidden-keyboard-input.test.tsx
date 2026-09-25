import { fireEvent, render, screen } from '@testing-library/react-native';

import { constant } from '@/constants/constant';
import { HiddenKeyboardInput } from '@/features/terminal/hidden-keyboard-input';
import type { HiddenKeyboardInputProps } from '@/features/terminal/hidden-keyboard-input';

type MountedInput = {
  onModifierUsed: jest.Mock;
  onWrite: jest.Mock;
};

const renderInput = async (props: Partial<HiddenKeyboardInputProps> = {}): Promise<MountedInput> => {
  const onModifierUsed = jest.fn();
  const onWrite = jest.fn();
  await render(
    <HiddenKeyboardInput
      armedModifier={null}
      onModifierUsed={onModifierUsed}
      onWrite={onWrite}
      {...props}
    />
  );
  return { onModifierUsed, onWrite };
};

const input = () => {
  return screen.getByDisplayValue(constant.keyboard.sentinel);
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
});
