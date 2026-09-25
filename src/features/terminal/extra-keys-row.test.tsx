import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import {
  EXTRA_KEY_LABELS,
  FUNCTION_KEY_LABELS,
  ExtraKeysRow,
} from '@/features/terminal/extra-keys-row';
import type { ExtraKeysRowProps } from '@/features/terminal/extra-keys-row';
import type { TerminalSelectionState } from '@/features/terminal/terminal-selection';

type SelectionSpies = {
  onSelectionAccept: jest.Mock;
  onSelectionMarkerTap: jest.Mock;
  onSelectionToggle: jest.Mock;
};

type MountedRow = SelectionSpies & {
  onModifierLongPress: jest.Mock;
  onModifierTap: jest.Mock;
  onModifierUsed: jest.Mock;
  onToggleKeyboard: jest.Mock;
  onWrite: jest.Mock;
  rerender(props: Partial<ExtraKeysRowProps>): Promise<void>;
};

const buildRow = (
  spies: SelectionSpies & {
    onModifierLongPress: jest.Mock;
    onModifierTap: jest.Mock;
    onModifierUsed: jest.Mock;
    onToggleKeyboard: jest.Mock;
    onWrite: jest.Mock;
  },
  props: Partial<ExtraKeysRowProps>
): ReactElement => {
  return (
    <ExtraKeysRow
      armedModifier={null}
      isSelectionAcceptable
      isApplicationCursorMode={false}
      isConnected
      isKeyboardVisible
      isLandscape={false}
      onModifierLongPress={spies.onModifierLongPress}
      onModifierTap={spies.onModifierTap}
      onModifierUsed={spies.onModifierUsed}
      onSelectionAccept={spies.onSelectionAccept}
      onSelectionMarkerTap={spies.onSelectionMarkerTap}
      onSelectionToggle={spies.onSelectionToggle}
      onToggleKeyboard={spies.onToggleKeyboard}
      onWrite={spies.onWrite}
      selection={null}
      {...props}
    />
  );
};

const renderRow = async (props: Partial<ExtraKeysRowProps> = {}): Promise<MountedRow> => {
  const spies = {
    onModifierLongPress: jest.fn(),
    onModifierTap: jest.fn(),
    onModifierUsed: jest.fn(),
    onSelectionAccept: jest.fn(),
    onSelectionMarkerTap: jest.fn(),
    onSelectionToggle: jest.fn(),
    onToggleKeyboard: jest.fn(),
    onWrite: jest.fn(),
  };
  const view = await render(buildRow(spies, props));
  return {
    ...spies,
    rerender(nextProps: Partial<ExtraKeysRowProps>) {
      return view.rerender(buildRow(spies, nextProps));
    },
  };
};

const activeSelection = (activeMarker: TerminalSelectionState['activeMarker']): TerminalSelectionState => {
  return { activeMarker, from: { col: 0, line: 0 }, to: { col: 4, line: 0 } };
};

const key = (label: string) => {
  return screen.getByRole('button', { name: label });
};

const layersButton = () => {
  return screen.getByRole('button', { name: 'Extra key layers' });
};

const flexDirectionOf = (testID: string): unknown => {
  const style = screen.getByTestId(testID).props.style;
  const styles = Array.isArray(style) ? style : [style];
  const directions = styles
    .flatMap((entry) => {
      return typeof entry === 'object' && entry !== null ? entry.flexDirection : undefined;
    })
    .filter((direction) => {
      return direction !== undefined;
    });
  return directions[directions.length - 1];
};

describe('ExtraKeysRow', () => {
  it('renders both Termux rows with all fourteen keys', async () => {
    await renderRow();
    expect(EXTRA_KEY_LABELS).toEqual([
      'ESC',
      '/',
      '-',
      'HOME',
      '↑',
      'END',
      'PGUP',
      'TAB',
      'CTRL',
      'ALT',
      '←',
      '↓',
      '→',
      'PGDN',
    ]);
    EXTRA_KEY_LABELS.forEach((label) => {
      expect(key(label)).toBeTruthy();
    });
  });

  it('lays keys out as horizontal rows in portrait', async () => {
    await renderRow();
    expect(flexDirectionOf('extra-keys-bar')).toBe('row');
  });

  it('lays keys out as vertical columns on the right in landscape', async () => {
    await renderRow({ isLandscape: true });
    expect(flexDirectionOf('extra-keys-bar')).toBe('column');
    expect(flexDirectionOf('extra-keys-groups')).toBe('row');
    EXTRA_KEY_LABELS.forEach((label) => {
      expect(key(label)).toBeTruthy();
    });
  });

  it('keeps keys writable from the landscape column', async () => {
    const { onWrite } = await renderRow({ isLandscape: true });
    await fireEvent.press(key('ESC'));
    await fireEvent.press(key('↑'));
    expect(onWrite.mock.calls.map(([sequence]) => { return sequence; })).toEqual(['\x1b', '\x1b[A']);
  });

  it('writes the fixed sequences for esc, tab and paging keys', async () => {
    const { onWrite } = await renderRow();
    await fireEvent.press(key('ESC'));
    await fireEvent.press(key('TAB'));
    await fireEvent.press(key('PGUP'));
    await fireEvent.press(key('PGDN'));
    expect(onWrite.mock.calls.map(([sequence]) => { return sequence; })).toEqual([
      '\x1b',
      '\t',
      '\x1b[5~',
      '\x1b[6~',
    ]);
  });

  it('writes CSI arrows in normal cursor mode', async () => {
    const { onWrite } = await renderRow();
    await fireEvent.press(key('↑'));
    await fireEvent.press(key('↓'));
    await fireEvent.press(key('←'));
    await fireEvent.press(key('→'));
    await fireEvent.press(key('HOME'));
    await fireEvent.press(key('END'));
    expect(onWrite.mock.calls.map(([sequence]) => { return sequence; })).toEqual([
      '\x1b[A',
      '\x1b[B',
      '\x1b[D',
      '\x1b[C',
      '\x1b[H',
      '\x1b[F',
    ]);
  });

  it('writes SS3 arrows in application cursor mode', async () => {
    const { onWrite } = await renderRow({ isApplicationCursorMode: true });
    await fireEvent.press(key('↑'));
    await fireEvent.press(key('END'));
    expect(onWrite.mock.calls.map(([sequence]) => { return sequence; })).toEqual([
      '\x1bOA',
      '\x1bOF',
    ]);
  });

  it('sends pipe on long-press of the dash key', async () => {
    const { onWrite } = await renderRow();
    await fireEvent(key('-'), 'longPress');
    expect(onWrite).toHaveBeenCalledWith('|');
  });

  it('reports modifier taps and long-press lock requests', async () => {
    const { onModifierLongPress, onModifierTap } = await renderRow();
    await fireEvent.press(key('CTRL'));
    expect(onModifierTap).toHaveBeenCalledWith('ctrl');
    await fireEvent(key('CTRL'), 'longPress');
    expect(onModifierLongPress).toHaveBeenCalledWith('ctrl');
    await fireEvent.press(key('ALT'));
    expect(onModifierTap).toHaveBeenCalledWith('alt');
    await fireEvent(key('ALT'), 'longPress');
    expect(onModifierLongPress).toHaveBeenCalledWith('alt');
  });

  it('composes an armed ctrl modifier into the next character key and consumes it', async () => {
    const { onModifierUsed, onWrite } = await renderRow({ armedModifier: 'ctrl' });
    await fireEvent.press(key('/'));
    expect(onWrite).toHaveBeenLastCalledWith('\x0f');
    expect(onModifierUsed).toHaveBeenCalledTimes(1);
  });

  it('composes an armed alt modifier into the next special key and consumes it', async () => {
    const { onModifierUsed, onWrite } = await renderRow({ armedModifier: 'alt' });
    await fireEvent.press(key('↑'));
    expect(onWrite).toHaveBeenLastCalledWith('\x1b\x1b[A');
    expect(onModifierUsed).toHaveBeenCalledTimes(1);
  });

  it('passes sequences through uncomposed when no modifier is armed', async () => {
    const { onModifierUsed, onWrite } = await renderRow();
    await fireEvent.press(key('/'));
    expect(onWrite).toHaveBeenLastCalledWith('/');
    expect(onModifierUsed).not.toHaveBeenCalled();
  });

  it('disables every key while disconnected', async () => {
    const { onWrite } = await renderRow({ isConnected: false });
    expect(key('↑').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(key('↑'));
    await fireEvent.press(key('CTRL'));
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('requests a keyboard toggle from the far-right keyboard button', async () => {
    const { onToggleKeyboard } = await renderRow();
    await fireEvent.press(screen.getByRole('button', { name: 'Toggle keyboard' }));
    expect(onToggleKeyboard).toHaveBeenCalledTimes(1);
  });

  it('keeps the keyboard button enabled while disconnected', async () => {
    await renderRow({ isConnected: false });
    expect(screen.getByRole('button', { name: 'Toggle keyboard' }).props.accessibilityState.disabled).not.toBe(true);
  });

  it('exposes the twelve function key labels for the second layer', async () => {
    await renderRow();
    expect(FUNCTION_KEY_LABELS).toEqual([
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F6',
      'F7',
      'F8',
      'F9',
      'F10',
      'F11',
      'F12',
    ]);
  });

  it('cycles through special keys, function keys and the selection layer', async () => {
    await renderRow();
    await fireEvent.press(layersButton());
    FUNCTION_KEY_LABELS.forEach((label) => {
      expect(key(label)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'ESC' })).toBeNull();
    await fireEvent.press(layersButton());
    expect(screen.getByRole('button', { name: 'Start selection' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'F1' })).toBeNull();
    await fireEvent.press(layersButton());
    expect(key('ESC')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start selection' })).toBeNull();
  });

  it('writes the fixed sequences for function keys on the second layer', async () => {
    const { onWrite } = await renderRow();
    await fireEvent.press(layersButton());
    await fireEvent.press(key('F1'));
    await fireEvent.press(key('F5'));
    await fireEvent.press(key('F12'));
    expect(onWrite.mock.calls.map(([sequence]) => { return sequence; })).toEqual([
      '\x1bOP',
      '\x1b[15~',
      '\x1b[24~',
    ]);
  });

  it('composes an armed alt modifier into a function key and consumes it', async () => {
    const { onModifierUsed, onWrite } = await renderRow({ armedModifier: 'alt' });
    await fireEvent.press(layersButton());
    await fireEvent.press(key('F1'));
    expect(onWrite).toHaveBeenLastCalledWith('\x1b\x1bOP');
    expect(onModifierUsed).toHaveBeenCalledTimes(1);
  });

  it('disables function keys while disconnected', async () => {
    const { onWrite } = await renderRow({ isConnected: false });
    await fireEvent.press(layersButton());
    expect(key('F1').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(key('F1'));
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('keeps the layers button enabled while disconnected', async () => {
    await renderRow({ isConnected: false });
    expect(layersButton().props.accessibilityState.disabled).not.toBe(true);
  });

  it('highlights the armed modifier key', async () => {
    const { rerender } = await renderRow();
    await rerender({ armedModifier: 'ctrl' });
    expect(activeBackgroundOf(key('CTRL'))).toBe('#5c5c8a');
    expect(activeBackgroundOf(key('ALT'))).toBeNull();
    await rerender({ armedModifier: 'alt' });
    expect(activeBackgroundOf(key('ALT'))).toBe('#5c5c8a');
    await rerender({ armedModifier: null });
    expect(activeBackgroundOf(key('CTRL'))).toBeNull();
  });
  it('disables the marker and copy keys while no selection is active', async () => {
    await renderRow({ isSelectionAcceptable: false });
    await fireEvent.press(layersButton());
    await fireEvent.press(layersButton());
    expect(screen.getByRole('button', { name: 'Select from marker' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Select to marker' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Accept selection' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Start selection' }).props.accessibilityState.disabled).not.toBe(true);
  });
  it('enables the marker keys with an active selection', async () => {
    await renderRow({ selection: activeSelection('from') });
    await fireEvent.press(layersButton());
    await fireEvent.press(layersButton());
    expect(screen.getByRole('button', { name: 'Select from marker' }).props.accessibilityState.disabled).not.toBe(true);
    expect(screen.getByRole('button', { name: 'Select to marker' }).props.accessibilityState.disabled).not.toBe(true);
  });
  it('reports selection toggles, marker taps and accept presses', async () => {
    const { onSelectionAccept, onSelectionMarkerTap, onSelectionToggle } = await renderRow({
      selection: activeSelection('from'),
    });
    await fireEvent.press(layersButton());
    await fireEvent.press(layersButton());
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel selection' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Select from marker' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Select to marker' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Accept selection' }));
    expect(onSelectionToggle).toHaveBeenCalledTimes(1);
    expect(onSelectionMarkerTap.mock.calls.map(([marker]) => {
      return marker;
    })).toEqual(['from', 'to']);
    expect(onSelectionAccept).toHaveBeenCalledTimes(1);
  });
  it('highlights the active marker key', async () => {
    const { rerender } = await renderRow();
    await fireEvent.press(layersButton());
    await fireEvent.press(layersButton());
    await rerender({ selection: activeSelection('from') });
    expect(activeBackgroundOf(screen.getByRole('button', { name: 'Select from marker' }))).toBe('#5c5c8a');
    expect(activeBackgroundOf(screen.getByRole('button', { name: 'Select to marker' }))).toBeNull();
    await rerender({ selection: activeSelection('to') });
    expect(activeBackgroundOf(screen.getByRole('button', { name: 'Select to marker' }))).toBe('#5c5c8a');
    expect(activeBackgroundOf(screen.getByRole('button', { name: 'Select from marker' }))).toBeNull();
  });
  it('switches the toggle label with the selection mode', async () => {
    const { rerender } = await renderRow();
    await fireEvent.press(layersButton());
    await fireEvent.press(layersButton());
    expect(screen.queryByRole('button', { name: 'Start selection' })).toBeTruthy();
    await rerender({ selection: activeSelection('to') });
    expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start selection' })).toBeNull();
  });
  it('keeps the selection keys enabled while disconnected', async () => {
    await renderRow({ isConnected: false, selection: activeSelection('from') });
    await fireEvent.press(layersButton());
    await fireEvent.press(layersButton());
    expect(screen.getByRole('button', { name: 'Cancel selection' }).props.accessibilityState.disabled).not.toBe(true);
    expect(screen.getByRole('button', { name: 'Select from marker' }).props.accessibilityState.disabled).not.toBe(true);
    expect(screen.getByRole('button', { name: 'Accept selection' }).props.accessibilityState.disabled).not.toBe(true);
  });

  it('forces the selection layer while a selection is active', async () => {
    const { rerender } = await renderRow();
    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    await rerender({ selection: activeSelection('from') });
    expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select from marker' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ESC' })).toBeNull();
    await rerender({ selection: null });
    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel selection' })).toBeNull();
  });

  it('returns to the first layer after the selection ends', async () => {
    const { rerender } = await renderRow();
    await fireEvent.press(layersButton());
    await rerender({ selection: activeSelection('to') });
    expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeTruthy();
    await rerender({ selection: null });
    expect(key('ESC')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'F1' })).toBeNull();
  });

  it('hides the keyboard button while the selection layer is showing', async () => {
    const { onToggleKeyboard, rerender } = await renderRow();
    expect(screen.getByRole('button', { name: 'Toggle keyboard' })).toBeTruthy();
    await rerender({ selection: activeSelection('from') });
    expect(screen.queryByRole('button', { name: 'Toggle keyboard' })).toBeNull();
    await rerender({ selection: null });
    expect(screen.getByRole('button', { name: 'Toggle keyboard' })).toBeTruthy();
    expect(onToggleKeyboard).not.toHaveBeenCalled();
  });
});

const activeBackgroundOf = (element: { props: Record<string, any> }): string | null => {
  const style = element.props.style as unknown;
  const styles = Array.isArray(style) ? style : [style];
  const matches = styles.filter((style) => {
    return typeof style === 'object' && style !== null && style.backgroundColor === '#5c5c8a';
  });
  return matches.length > 0 ? '#5c5c8a' : null;
};
