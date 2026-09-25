import { modifierInput } from '@/features/terminal/modifier-input';

describe('modifierInput', () => {
  it('passes sequences through when no modifier is armed', () => {
    expect(modifierInput.composeSequence({ modifier: null, sequence: 'x' })).toBe('x');
    expect(modifierInput.composeSequence({ modifier: null, sequence: '\x1b[A' })).toBe('\x1b[A');
  });

  it('prefixes alt with escape', () => {
    expect(modifierInput.composeSequence({ modifier: 'alt', sequence: 'x' })).toBe('\x1bx');
    expect(modifierInput.composeSequence({ modifier: 'alt', sequence: '\r' })).toBe('\x1b\r');
  });

  it('masks single characters to their control code for ctrl', () => {
    expect(modifierInput.composeSequence({ modifier: 'ctrl', sequence: 'c' })).toBe('\x03');
    expect(modifierInput.composeSequence({ modifier: 'ctrl', sequence: '/' })).toBe('\x0f');
  });

  it('leaves multi-character sequences uncomposed for ctrl', () => {
    expect(modifierInput.composeSequence({ modifier: 'ctrl', sequence: '\x1b[A' })).toBe('\x1b[A');
  });
});
