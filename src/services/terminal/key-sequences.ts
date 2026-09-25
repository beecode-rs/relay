export type TerminalKeyName =
  | 'escape'
  | 'tab'
  | 'enter'
  | 'backspace'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'pgup'
  | 'pgdn'
  | 'f1'
  | 'f2'
  | 'f3'
  | 'f4'
  | 'f5'
  | 'f6'
  | 'f7'
  | 'f8'
  | 'f9'
  | 'f10'
  | 'f11'
  | 'f12';

const FIXED_SEQUENCES: Record<string, string> = {
  escape: '\x1b',
  tab: '\t',
  enter: '\r',
  backspace: '\x7f',
  pgup: '\x1b[5~',
  pgdn: '\x1b[6~',
  f1: '\x1bOP',
  f2: '\x1bOQ',
  f3: '\x1bOR',
  f4: '\x1bOS',
  f5: '\x1b[15~',
  f6: '\x1b[17~',
  f7: '\x1b[18~',
  f8: '\x1b[19~',
  f9: '\x1b[20~',
  f10: '\x1b[21~',
  f11: '\x1b[23~',
  f12: '\x1b[24~',
};

const CURSOR_KEY_SEQUENCES: Record<string, { normal: string; application: string }> = {
  up: { normal: '\x1b[A', application: '\x1bOA' },
  down: { normal: '\x1b[B', application: '\x1bOB' },
  right: { normal: '\x1b[C', application: '\x1bOC' },
  left: { normal: '\x1b[D', application: '\x1bOD' },
  home: { normal: '\x1b[H', application: '\x1bOH' },
  end: { normal: '\x1b[F', application: '\x1bOF' },
};

export const keySequences = {
  sequenceFor(params: { key: TerminalKeyName; isApplicationCursorMode: boolean }): string {
    const fixed = FIXED_SEQUENCES[params.key];
    if (fixed !== undefined) {
      return fixed;
    }
    const cursor = CURSOR_KEY_SEQUENCES[params.key];
    if (cursor === undefined) {
      throw new Error(`unknown key: ${params.key}`);
    }
    if (params.isApplicationCursorMode) {
      return cursor.application;
    }
    return cursor.normal;
  },

  scrollSequence(params: {
    rows: number;
    isApplicationCursorKeys: boolean;
    isMouseTrackingEnabled: boolean;
    x: number;
    y: number;
  }): string {
    if (params.rows === 0) {
      return '';
    }
    const rowEvents = Math.abs(params.rows);
    if (params.isMouseTrackingEnabled) {
      const button = params.rows > 0 ? 65 : 64;
      return `\x1b[<${button};${params.x + 1};${params.y + 1}M`.repeat(rowEvents);
    }
    const key = params.rows > 0 ? 'down' : 'up';
    const arrow = this.sequenceFor({ key, isApplicationCursorMode: params.isApplicationCursorKeys });
    return arrow.repeat(rowEvents);
  },

  ctrlChar(char: string): string {
    return String.fromCharCode(char.charCodeAt(0) & 0x1f);
  },

  altPrefixed(sequence: string): string {
    return `\x1b${sequence}`;
  },
};
