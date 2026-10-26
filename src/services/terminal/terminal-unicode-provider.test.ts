import {
  terminalUnicodeProvider,
  terminalUnicodeWidthUtil,
} from '@/services/terminal/terminal-unicode-provider';

describe('terminalUnicodeProvider.wcwidth', () => {
  it('gives emoji and wide codepoints two columns', () => {
    // Widths pinned against a live tmux grid (utf8proc, modern Unicode).
    expect(terminalUnicodeProvider.wcwidth(0x2705)).toBe(2); // ✅
    expect(terminalUnicodeProvider.wcwidth(0x1f600)).toBe(2); // 😀
    expect(terminalUnicodeProvider.wcwidth(0x1f9d1)).toBe(2); // 🧑
    expect(terminalUnicodeProvider.wcwidth(0x4e2d)).toBe(2); // 中
  });

  it('gives narrow codepoints one column', () => {
    expect(terminalUnicodeProvider.wcwidth(0x41)).toBe(1); // A
    expect(terminalUnicodeProvider.wcwidth(0x2026)).toBe(1); // … (East Asian Ambiguous)
    expect(terminalUnicodeProvider.wcwidth(0x1f1f8)).toBe(1); // 🇸 regional indicator
  });

  it('gives joining codepoints zero columns', () => {
    expect(terminalUnicodeProvider.wcwidth(0x200d)).toBe(0); // ZWJ
    expect(terminalUnicodeProvider.wcwidth(0xfe0f)).toBe(0); // VS16
    expect(terminalUnicodeProvider.wcwidth(0x0301)).toBe(0); // combining acute
    expect(terminalUnicodeProvider.wcwidth(0x3099)).toBe(0); // katakana combining (wide block)
  });

  it('gives control characters zero columns', () => {
    expect(terminalUnicodeProvider.wcwidth(0x09)).toBe(0);
    expect(terminalUnicodeProvider.wcwidth(0x85)).toBe(0);
  });
});

describe('terminalUnicodeProvider.toStringWidth', () => {
  it('matches the tmux cursor advance for common sequences', () => {
    // Cursor positions measured on a live tmux after "G" + sequence + "H".
    expect(terminalUnicodeProvider.toStringWidth([0x41, 0x2705, 0x42])).toBe(4); // A✅B
    expect(terminalUnicodeProvider.toStringWidth([0x49, 0x4e2d, 0x4a])).toBe(4); // I中J
    expect(terminalUnicodeProvider.toStringWidth([0x4b, 0x2026, 0x4c])).toBe(3); // K…L
    expect(
      terminalUnicodeProvider.toStringWidth([0x43, 0x1f9d1, 0x200d, 0x1f4bb, 0x44]), // C🧑‍💻D
    ).toBe(4);
    expect(terminalUnicodeProvider.toStringWidth([0x45, 0x26a0, 0xfe0f, 0x46])).toBe(4); // E⚠️F
    expect(terminalUnicodeProvider.toStringWidth([0x47, 0x1f1f8, 0x1f1e6, 0x48])).toBe(4); // G🇸🇦H
  });

  it('keeps regional indicator pairing parity', () => {
    expect(terminalUnicodeProvider.toStringWidth([0x1f1f8, 0x1f1e6, 0x1f1f8])).toBe(3); // pair + lone
    expect(terminalUnicodeProvider.toStringWidth([0x1f1f8, 0x1f1e6, 0x1f1f8, 0x1f1e6])).toBe(4);
    expect(terminalUnicodeProvider.toStringWidth([0x1f1f8])).toBe(1); // lone
    expect(terminalUnicodeProvider.toStringWidth([0x31, 0xfe0f, 0x20e3])).toBe(2); // 1️⃣ keycap
  });
});

describe('terminalUnicodeWidthUtil', () => {
  it('splits text into graphemes with grid columns', () => {
    // "A✅🇸🇦é" -> A(col 0,w1), ✅(col 1,w2), flag pair(col 3,w2, one grapheme),
    // é(col 5,w1).
    const graphemes = terminalUnicodeWidthUtil.toGraphemes('A✅🇸🇦é');
    expect(graphemes).toEqual([
      { column: 0, end: 1, start: 0, width: 1 },
      { column: 1, end: 2, start: 1, width: 2 },
      { column: 3, end: 6, start: 2, width: 2 },
      { column: 5, end: 7, start: 6, width: 1 },
    ]);
  });

  it('joins ZWJ clusters into one grapheme', () => {
    const graphemes = terminalUnicodeWidthUtil.toGraphemes('🧑‍💻');
    expect(graphemes).toHaveLength(1);
    expect(graphemes[0]).toEqual({ column: 0, end: 5, start: 0, width: 2 });
  });

  it('maps grid columns to text indexes without cutting clusters', () => {
    const text = 'A✅B';
    // Column 2 is the second column of ✅; it resolves to the emoji start.
    expect(terminalUnicodeWidthUtil.textIndexOfColumn(text, 2)).toBe(1);
    expect(terminalUnicodeWidthUtil.textIndexOfColumn(text, 3)).toBe(2);
    expect(terminalUnicodeWidthUtil.textIndexOfColumn(text, 99)).toBe(3);
  });

  it('maps text indexes to grid columns', () => {
    const text = 'A✅B';
    expect(terminalUnicodeWidthUtil.columnOfTextIndex(text, 0)).toBe(0);
    expect(terminalUnicodeWidthUtil.columnOfTextIndex(text, 1)).toBe(1);
    expect(terminalUnicodeWidthUtil.columnOfTextIndex(text, 2)).toBe(3); // B
    expect(terminalUnicodeWidthUtil.columnOfTextIndex(text, 3)).toBe(4); // past the end
    expect(terminalUnicodeWidthUtil.columnOfTextIndex(text, 99)).toBe(4);
    // An index inside an astral grapheme resolves to the grapheme's column.
    expect(terminalUnicodeWidthUtil.columnOfTextIndex('A😀B', 2)).toBe(1); // low surrogate of 😀
  });

  it('measures a text width as the sum of grapheme widths', () => {
    expect(terminalUnicodeWidthUtil.widthOf('A✅B')).toBe(4);
    expect(terminalUnicodeWidthUtil.widthOf('🧑‍💻')).toBe(2);
    expect(terminalUnicodeWidthUtil.widthOf('🇸🇦')).toBe(2);
    expect(terminalUnicodeWidthUtil.widthOf('')).toBe(0);
  });
});
