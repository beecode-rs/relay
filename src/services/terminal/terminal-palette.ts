const BASE_COLORS = [
  '#000000',
  '#cd0000',
  '#00cd00',
  '#cdcd00',
  '#3b78ff',
  '#cd00cd',
  '#00cdcd',
  '#e5e5e5',
  '#7f7f7f',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#5c5cff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
];

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

const GRAYSCALE_FIRST_INDEX = 232;
const CUBE_FIRST_INDEX = 16;

export const terminalPaletteUtil = {
  colorAt(params: { index: number }): string {
    const { index } = params;
    if (!Number.isInteger(index) || index < 0 || index > 255) {
      throw new Error('index must be an integer between 0 and 255');
    }
    if (index < BASE_COLORS.length) {
      return BASE_COLORS[index];
    }
    if (index < GRAYSCALE_FIRST_INDEX) {
      return this._cubeColorAt({ index });
    }

    return this._grayscaleColorAt({ index });
  },

  _cubeColorAt(params: { index: number }): string {
    const { index } = params;
    const offset = index - CUBE_FIRST_INDEX;
    const red = CUBE_LEVELS[Math.floor(offset / 36) % 6];
    const green = CUBE_LEVELS[Math.floor(offset / 6) % 6];
    const blue = CUBE_LEVELS[offset % 6];

    return `#${this._toHexPair(red)}${this._toHexPair(green)}${this._toHexPair(blue)}`;
  },

  _grayscaleColorAt(params: { index: number }): string {
    const { index } = params;
    const level = 8 + (index - GRAYSCALE_FIRST_INDEX) * 10;
    const pair = this._toHexPair(level);

    return `#${pair}${pair}${pair}`;
  },

  _toHexPair(value: number): string {
    return value.toString(16).padStart(2, '0');
  },
};
