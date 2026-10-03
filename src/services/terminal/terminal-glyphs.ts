// The bundled JetBrains Mono build ships without several symbol ranges that
// CLI tools emit (media controls, dingbat marks, braille spinners). Terminal
// rows render in a single font family, so glyphs the font lacks have no
// per-glyph fallback on React Native; substitute the closest covered glyph
// instead. Every substitute is a single-cell character, so column alignment
// and cell widths are preserved.
const GLYPH_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  // Media controls (⏩⏪⏭⏮⏯⏴⏵⏶⏷⏸⏹⏺) — e.g. the Claude Code status line.
  '⏩': '»',
  '⏪': '«',
  '⏫': '↑',
  '⏬': '↓',
  '⏭': '»',
  '⏮': '«',
  '⏯': '▸',
  '⏴': '◂',
  '⏵': '▸',
  '⏶': '▴',
  '⏷': '▾',
  '⏸': '║',
  '⏹': '■',
  '⏺': '●',
  // Hollow and partial circles.
  '○': '◯',
  '◐': '◔',
  '◑': '◕',
  '◒': '◔',
  '◓': '◕',
  '◦': '·',
  '◈': '◆',
  '◉': '◎',
  '◻': '□',
  '◼': '■',
  // Stars and check/cross marks.
  '★': '*',
  '☆': '*',
  '✓': '√',
  '✔': '√',
  '✗': '×',
  '✘': '×',
  '✦': '*',
  '✧': '*',
  '✳': '*',
  '✴': '*',
  '✵': '*',
  '✶': '*',
  '✷': '*',
  '✸': '*',
  '✹': '*',
  '✺': '*',
  '✻': '*',
  '✼': '*',
  '✽': '*',
  // Ballot boxes.
  '☐': '□',
  '☑': '■',
  '☒': '×',
};

// Braille patterns (U+2800–U+28FF) are missing entirely; spinners and
// progress bars built from them would render as tofu.
const BRAILLE_FIRST_CODE_POINT = 0x2800;
const BRAILLE_LAST_CODE_POINT = 0x28ff;

export const terminalGlyphUtil = {
  toRenderableText(text: string): string {
    const characters = Array.from(text);
    let isSubstituted = false;
    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index];
      const codePoint = character.codePointAt(0) ?? 0;
      const substitute =
        codePoint >= BRAILLE_FIRST_CODE_POINT && codePoint <= BRAILLE_LAST_CODE_POINT
          ? codePoint === BRAILLE_FIRST_CODE_POINT
            ? ' '
            : '•'
          : GLYPH_SUBSTITUTIONS[character];
      if (substitute !== undefined) {
        characters[index] = substitute;
        isSubstituted = true;
      }
    }
    return isSubstituted ? characters.join('') : text;
  },
};
