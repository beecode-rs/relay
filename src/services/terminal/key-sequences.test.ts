import { keySequences } from '@/services/terminal/key-sequences';

describe('keySequences.sequenceFor', () => {
  const fixedExpectations: { key: Parameters<typeof keySequences.sequenceFor>[0]['key']; sequence: string }[] = [
    { key: 'escape', sequence: '\x1b' },
    { key: 'tab', sequence: '\t' },
    { key: 'enter', sequence: '\r' },
    { key: 'backspace', sequence: '\x7f' },
    { key: 'pgup', sequence: '\x1b[5~' },
    { key: 'pgdn', sequence: '\x1b[6~' },
    { key: 'f1', sequence: '\x1bOP' },
    { key: 'f2', sequence: '\x1bOQ' },
    { key: 'f3', sequence: '\x1bOR' },
    { key: 'f4', sequence: '\x1bOS' },
    { key: 'f5', sequence: '\x1b[15~' },
    { key: 'f6', sequence: '\x1b[17~' },
    { key: 'f7', sequence: '\x1b[18~' },
    { key: 'f8', sequence: '\x1b[19~' },
    { key: 'f9', sequence: '\x1b[20~' },
    { key: 'f10', sequence: '\x1b[21~' },
    { key: 'f11', sequence: '\x1b[23~' },
    { key: 'f12', sequence: '\x1b[24~' },
  ];

  it.each(fixedExpectations)('maps $key to its fixed sequence', ({ key, sequence }) => {
    expect(keySequences.sequenceFor({ key, isApplicationCursorMode: false })).toBe(sequence);
    expect(keySequences.sequenceFor({ key, isApplicationCursorMode: true })).toBe(sequence);
  });

  it('maps arrows and home/end to CSI sequences in normal mode', () => {
    expect(keySequences.sequenceFor({ key: 'up', isApplicationCursorMode: false })).toBe('\x1b[A');
    expect(keySequences.sequenceFor({ key: 'down', isApplicationCursorMode: false })).toBe('\x1b[B');
    expect(keySequences.sequenceFor({ key: 'right', isApplicationCursorMode: false })).toBe('\x1b[C');
    expect(keySequences.sequenceFor({ key: 'left', isApplicationCursorMode: false })).toBe('\x1b[D');
    expect(keySequences.sequenceFor({ key: 'home', isApplicationCursorMode: false })).toBe('\x1b[H');
    expect(keySequences.sequenceFor({ key: 'end', isApplicationCursorMode: false })).toBe('\x1b[F');
  });

  it('switches arrows and home/end to SS3 sequences in application mode', () => {
    expect(keySequences.sequenceFor({ key: 'up', isApplicationCursorMode: true })).toBe('\x1bOA');
    expect(keySequences.sequenceFor({ key: 'down', isApplicationCursorMode: true })).toBe('\x1bOB');
    expect(keySequences.sequenceFor({ key: 'right', isApplicationCursorMode: true })).toBe('\x1bOC');
    expect(keySequences.sequenceFor({ key: 'left', isApplicationCursorMode: true })).toBe('\x1bOD');
    expect(keySequences.sequenceFor({ key: 'home', isApplicationCursorMode: true })).toBe('\x1bOH');
    expect(keySequences.sequenceFor({ key: 'end', isApplicationCursorMode: true })).toBe('\x1bOF');
  });

  it('throws for an unknown key name', () => {
    expect(() => {
      return keySequences.sequenceFor({ key: 'pause' as never, isApplicationCursorMode: false });
    }).toThrow('unknown key');
  });
});

describe('keySequences.ctrlChar', () => {
  it('maps lowercase letters to their control codes', () => {
    expect(keySequences.ctrlChar('c')).toBe('\x03');
    expect(keySequences.ctrlChar('a')).toBe('\x01');
    expect(keySequences.ctrlChar('z')).toBe('\x1a');
  });

  it('maps uppercase letters to the same control codes', () => {
    expect(keySequences.ctrlChar('C')).toBe('\x03');
  });

  it('maps space to nul', () => {
    expect(keySequences.ctrlChar(' ')).toBe('\x00');
  });
});

describe('keySequences.altPrefixed', () => {
  it('prefixes the escape character', () => {
    expect(keySequences.altPrefixed('x')).toBe('\x1bx');
    expect(keySequences.altPrefixed('\r')).toBe('\x1b\r');
  });
});

describe('keySequences.scrollSequence', () => {
  it('returns an empty sequence for zero rows', () => {
    expect(
      keySequences.scrollSequence({
        isApplicationCursorKeys: false,
        isMouseTrackingEnabled: false,
        rows: 0,
        x: 0,
        y: 0,
      })
    ).toBe('');
  });

  it('repeats wheel-down events for positive rows when the host tracks the mouse', () => {
    expect(
      keySequences.scrollSequence({
        isApplicationCursorKeys: false,
        isMouseTrackingEnabled: true,
        rows: 2,
        x: 5,
        y: 9,
      })
    ).toBe('\x1b[<65;6;10M\x1b[<65;6;10M');
  });

  it('repeats wheel-up events for negative rows when the host tracks the mouse', () => {
    expect(
      keySequences.scrollSequence({
        isApplicationCursorKeys: false,
        isMouseTrackingEnabled: true,
        rows: -1,
        x: 0,
        y: 0,
      })
    ).toBe('\x1b[<64;1;1M');
  });

  it('falls back to normal-mode arrow keys when the host does not track the mouse', () => {
    expect(
      keySequences.scrollSequence({
        isApplicationCursorKeys: false,
        isMouseTrackingEnabled: false,
        rows: 2,
        x: 0,
        y: 0,
      })
    ).toBe('\x1b[B\x1b[B');
    expect(
      keySequences.scrollSequence({
        isApplicationCursorKeys: false,
        isMouseTrackingEnabled: false,
        rows: -3,
        x: 0,
        y: 0,
      })
    ).toBe('\x1b[A\x1b[A\x1b[A');
  });

  it('falls back to application-mode arrow keys when cursor keys are application mode', () => {
    expect(
      keySequences.scrollSequence({
        isApplicationCursorKeys: true,
        isMouseTrackingEnabled: false,
        rows: 1,
        x: 0,
        y: 0,
      })
    ).toBe('\x1bOB');
  });
});
