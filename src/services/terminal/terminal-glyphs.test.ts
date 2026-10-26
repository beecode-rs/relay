import { terminalGlyphUtil } from '@/services/terminal/terminal-glyphs';

describe('terminalGlyphUtil', () => {
  it('returns plain and already-covered text unchanged', () => {
    expect(terminalGlyphUtil.toRenderableText('plain terminal text')).toBe('plain terminal text');
    expect(terminalGlyphUtil.toRenderableText('┌─┐│ ●■□▸×√»«→')).toBe('┌─┐│ ●■□▸×√»«→');
  });

  it('substitutes the media-control glyphs used by the Claude Code status line', () => {
    expect(terminalGlyphUtil.toRenderableText('⏵⏵ bypass permissions on')).toBe('▸▸ bypass permissions on');
    expect(terminalGlyphUtil.toRenderableText('⏵⏵ auto-accept edits on')).toBe('▸▸ auto-accept edits on');
    expect(terminalGlyphUtil.toRenderableText('⏺')).toBe('●');
    expect(terminalGlyphUtil.toRenderableText('⏸')).toBe('║');
    expect(terminalGlyphUtil.toRenderableText('⏹')).toBe('■');
  });

  it('leaves east-asian-wide media glyphs to the system fallback', () => {
    expect(terminalGlyphUtil.toRenderableText('⏩⏪')).toBe('⏩⏪');
  });

  it('substitutes check, cross, circle and star marks', () => {
    expect(terminalGlyphUtil.toRenderableText('✓ Done (3s)')).toBe('√ Done (3s)');
    expect(terminalGlyphUtil.toRenderableText('✔')).toBe('√');
    expect(terminalGlyphUtil.toRenderableText('✗')).toBe('×');
    expect(terminalGlyphUtil.toRenderableText('✘')).toBe('×');
    expect(terminalGlyphUtil.toRenderableText('○')).toBe('◯');
    expect(terminalGlyphUtil.toRenderableText('◐◑◒◓')).toBe('◔◕◔◕');
    expect(terminalGlyphUtil.toRenderableText('✶★☆')).toBe('***');
    expect(terminalGlyphUtil.toRenderableText('☐☑☒')).toBe('□■×');
  });

  it('substitutes braille spinner and progress patterns', () => {
    expect(terminalGlyphUtil.toRenderableText('⠋⠙⠹')).toBe('•••');
    expect(terminalGlyphUtil.toRenderableText('⣿⣷⣶')).toBe('•••');
    expect(terminalGlyphUtil.toRenderableText('a⠀b')).toBe('a b');
  });

  it('substitutes the opencode progress wave and status glyphs', () => {
    expect(terminalGlyphUtil.toRenderableText('■■■⬝⬝⬝⬝⬝')).toBe('■■■▪▪▪▪▪');
    expect(terminalGlyphUtil.toRenderableText('⊙ 1 MCP failed')).toBe('◎ 1 MCP failed');
  });

  it('substitutes the opencode spinner frames', () => {
    expect(terminalGlyphUtil.toRenderableText('▫▪▣■▣▪')).toBe('▫▪■■■▪');
    expect(terminalGlyphUtil.toRenderableText('◰◳◲◱')).toBe('▘▝▗▖');
    expect(terminalGlyphUtil.toRenderableText('▧▩▨▩')).toBe('▒░▓░');
    expect(terminalGlyphUtil.toRenderableText('◧⬒◨⬓')).toBe('◧▀◨▄');
    expect(terminalGlyphUtil.toRenderableText('▁▂▃▄▅▆▇█')).toBe('▁▂▃▄▅▆▇█');
  });

  it('substitutes progress rectangles other tools emit', () => {
    expect(terminalGlyphUtil.toRenderableText('▰▰▰▱▱')).toBe('■■■□□');
    expect(terminalGlyphUtil.toRenderableText('▮▮▮▯')).toBe('■■■□');
  });

  it('replaces uncovered symbol glyphs with a generic covered glyph', () => {
    expect(terminalGlyphUtil.toRenderableText('⌬')).toBe('□');
    expect(terminalGlyphUtil.toRenderableText('⬢')).toBe('□');
  });

  it('keeps east-asian-wide symbol glyphs untouched', () => {
    expect(terminalGlyphUtil.toRenderableText('⬛⭐')).toBe('⬛⭐');
  });

  it('substitutes a lone regional indicator letter with its ASCII letter', () => {
    // A lone indicator cell has no partner to shape a flag with and its
    // squared-letter glyph is about two columns wide.
    expect(terminalGlyphUtil.toRenderableText('🇸')).toBe('S');
    expect(terminalGlyphUtil.toRenderableText('🇦')).toBe('A');
    expect(terminalGlyphUtil.toRenderableText('🇿')).toBe('Z');
  });

  it('keeps regional indicator pairs untouched for flag shaping', () => {
    expect(terminalGlyphUtil.toRenderableText('🇸🇦')).toBe('🇸🇦');
  });

  it('leaves surrogate pairs untouched', () => {
    expect(terminalGlyphUtil.toRenderableText('a📈b ✓')).toBe('a📈b √');
  });
});
