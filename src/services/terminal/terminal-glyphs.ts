// The bundled JetBrains Mono build ships without several symbol ranges that
// CLI tools emit (media controls, dingbat marks, braille spinners, the opencode
// progress wave, quadrant spinners). Terminal rows render in a single font
// family, so glyphs the font lacks have no per-glyph fallback on React Native:
// the system font renders them at its own, narrower advance width and the row
// squishes out of the cell grid. Substitute the closest covered glyph instead.
// Every substitute is a single-cell character, so column alignment and cell
// widths are preserved.
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
  '◍': '◎',
  '⬤': '●',
  '⊙': '◎',
  // Squares with inset or patterned fill — spinner and bloom frames
  // (e.g. the opencode "Inset bloom" and "Crosshatch" spinners).
  '▣': '■',
  '▤': '░',
  '▥': '▒',
  '▦': '▓',
  '▧': '▒',
  '▨': '▓',
  '▩': '░',
  // Quadrant and half-black squares — "Corner orbit" and "Half rotation"
  // spinners.
  '◰': '▘',
  '◱': '▖',
  '◲': '▗',
  '◳': '▝',
  '⬒': '▀',
  '⬓': '▄',
  // Progress bar rectangles other tools emit.
  '▮': '■',
  '▯': '□',
  '▰': '■',
  '▱': '□',
  '▬': '━',
  '▭': '─',
  // The opencode session progress wave fills with small squares
  // (■■■⬝⬝⬝); ⬝ is missing from the font and renders narrow.
  '⬝': '▪',
  // Arc spinner segments and solid corner triangles.
  '◜': '▘',
  '◝': '▝',
  '◞': '▗',
  '◟': '▖',
  '◠': '▀',
  '◡': '▄',
  '◢': '▗',
  '◣': '▖',
  '◤': '▘',
  '◥': '▝',
  // Black text-presentation arrows and medium diamonds.
  '⬅': '←',
  '➡': '→',
  '⬆': '↑',
  '⬇': '↓',
  '⬌': '↔',
  '⬥': '◆',
  '⬩': '▪',
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

// Exact symbol-glyph coverage of the bundled JetBrains Mono 400Regular /
// 700Bold builds, generated from the fonts' cmap for the ranges below. A
// symbol glyph that is covered needs no substitution; one that is not falls
// back to the system font and breaks the cell grid.
const FONT_COVERED_SYMBOL_GLYPHS = new Set(
  '←↑→↓↔↕↖↗↘↙⇧∀∂∃∈∉∋∌∏∐∑−∕∘∙√∞∣∥∧∨∫∷∼≈≉≠≡≤≥⊂⊃⊄⊅⊆⊇⌂⌃⌄⌅⌘⌥⍴⏻⏼⏽⏾─━│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿╀╁╂╃╄╅╆╇╈╉╊╋╌╍╎╏═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬╭╮╯╰╱╲╳╴╵╶╷╸╹╺╻╼╽╾╿▀▁▂▃▄▅▆▇█▉▊▋▌▍▎▏▐░▒▓▔▕▖▗▘▙▚▛▜▝▞▟■□▪▫▲△▴▵▶▷▸▹►▻▼▽▾▿◀◁◂◃◄◅◆◇◊◌◎●◔◕◧◨◩◪◫◯⟵⟶⟷⭘'
);

// Terminal UIs draw single-cell glyphs from these ranges; glyphs from them
// that the font lacks get a generic covered substitute below.
const SYMBOL_GLYPH_RANGES: readonly (readonly [number, number])[] = [
  [0x2190, 0x21ff], // Arrows
  [0x2200, 0x22ff], // Mathematical operators
  [0x2300, 0x23ff], // Misc technical
  [0x2400, 0x243f], // Control pictures
  [0x2500, 0x257f], // Box drawing
  [0x2580, 0x259f], // Block elements
  [0x25a0, 0x25ff], // Geometric shapes
  [0x27f0, 0x27ff], // Supplemental arrows-b
  [0x2b00, 0x2bff], // Misc symbols and arrows
];

// East-Asian-wide glyphs occupy two cells; replacing them with a single-cell
// substitute would shift every following column, so they render unchanged.
const WIDE_SYMBOL_GLYPHS = new Set('⌚⌛〈〉⏩⏪⏫⏬⏰⏳◽◾⬛⬜⭐⭕');

const GENERIC_FALLBACK_GLYPH = '□';

const isUncoveredSymbolGlyph = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0;
  const isInSymbolRange = SYMBOL_GLYPH_RANGES.some(
    ([first, last]) => codePoint >= first && codePoint <= last
  );
  if (!isInSymbolRange || WIDE_SYMBOL_GLYPHS.has(character)) {
    return false;
  }
  return !FONT_COVERED_SYMBOL_GLYPHS.has(character);
};

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
          : GLYPH_SUBSTITUTIONS[character] ??
            (isUncoveredSymbolGlyph(character) ? GENERIC_FALLBACK_GLYPH : undefined);
      if (substitute !== undefined) {
        characters[index] = substitute;
        isSubstituted = true;
      }
    }
    return isSubstituted ? characters.join('') : text;
  },
};
