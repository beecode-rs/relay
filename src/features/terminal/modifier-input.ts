import { keySequences } from '@/services/terminal/key-sequences';

export type TerminalModifierName = 'ctrl' | 'alt';

export const modifierInput = {
  composeSequence(params: { modifier: TerminalModifierName | null; sequence: string }): string {
    if (params.modifier === 'alt') {
      return keySequences.altPrefixed(params.sequence);
    }
    if (params.modifier === 'ctrl' && params.sequence.length === 1) {
      return keySequences.ctrlChar(params.sequence);
    }
    return params.sequence;
  },
};
