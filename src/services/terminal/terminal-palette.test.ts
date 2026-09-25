import { constant } from '@/constants/constant';
import { terminalPaletteUtil } from '@/services/terminal/terminal-palette';

describe('terminalPaletteUtil.colorAt', () => {
  const standardValues: { index: number; hex: string }[] = [
    { index: 0, hex: '#000000' },
    { index: 15, hex: '#ffffff' },
    { index: 16, hex: '#000000' },
    { index: 231, hex: '#ffffff' },
    { index: 244, hex: '#808080' },
    { index: 255, hex: '#eeeeee' },
  ];

  it.each(standardValues)('returns the standard xterm hex for index $index', ({ index, hex }) => {
    expect(terminalPaletteUtil.colorAt({ index })).toBe(hex);
  });

  it('walks the 6x6x6 cube corners correctly', () => {
    expect(terminalPaletteUtil.colorAt({ index: 17 })).toBe('#00005f');
    expect(terminalPaletteUtil.colorAt({ index: 196 })).toBe('#ff0000');
    expect(terminalPaletteUtil.colorAt({ index: 21 })).toBe('#0000ff');
    expect(terminalPaletteUtil.colorAt({ index: 46 })).toBe('#00ff00');
  });

  it('steps the grayscale ramp by tens from eight', () => {
    expect(terminalPaletteUtil.colorAt({ index: 232 })).toBe('#080808');
    expect(terminalPaletteUtil.colorAt({ index: 233 })).toBe('#121212');
  });

  it('exports the terminal background and foreground constants', () => {
    expect(constant.terminal.bg).toBe('#000000');
    expect(constant.terminal.fg).toBe('#eeeeee');
  });

  it.each([-1, 256, 10.5])('throws for out-of-range index %s', (index) => {
    expect(() => {
      return terminalPaletteUtil.colorAt({ index });
    }).toThrow('index');
  });
});
