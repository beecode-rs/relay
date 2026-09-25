import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { constant } from '@/constants/constant';
import { modifierInput } from '@/features/terminal/modifier-input';
import type { TerminalModifierName } from '@/features/terminal/modifier-input';
import type { TerminalSelectionMarkerName, TerminalSelectionState } from '@/features/terminal/terminal-selection';
import { keySequences } from '@/services/terminal/key-sequences';
import type { TerminalKeyName } from '@/services/terminal/key-sequences';

type ExtraKeyDefinition =
  | { kind: 'special'; key: TerminalKeyName; label: string }
  | { kind: 'char'; char: string; label: string; longPressChar: string | null }
  | { kind: 'modifier'; label: string; modifier: TerminalModifierName };

const EXTRA_KEY_LAYER_ORDER = ['special', 'function', 'select'] as const;

type ExtraKeyLayerName = (typeof EXTRA_KEY_LAYER_ORDER)[number];

const SPECIAL_KEY_ROWS: ExtraKeyDefinition[][] = [
  [
    { kind: 'special', key: 'escape', label: 'ESC' },
    { kind: 'char', char: '/', label: '/', longPressChar: null },
    { kind: 'char', char: '-', label: '-', longPressChar: '|' },
    { kind: 'special', key: 'home', label: 'HOME' },
    { kind: 'special', key: 'up', label: '↑' },
    { kind: 'special', key: 'end', label: 'END' },
    { kind: 'special', key: 'pgup', label: 'PGUP' },
  ],
  [
    { kind: 'special', key: 'tab', label: 'TAB' },
    { kind: 'modifier', label: 'CTRL', modifier: 'ctrl' },
    { kind: 'modifier', label: 'ALT', modifier: 'alt' },
    { kind: 'special', key: 'left', label: '←' },
    { kind: 'special', key: 'down', label: '↓' },
    { kind: 'special', key: 'right', label: '→' },
    { kind: 'special', key: 'pgdn', label: 'PGDN' },
  ],
];

const FUNCTION_KEY_ROWS: ExtraKeyDefinition[][] = [
  [
    { kind: 'special', key: 'f1', label: 'F1' },
    { kind: 'special', key: 'f2', label: 'F2' },
    { kind: 'special', key: 'f3', label: 'F3' },
    { kind: 'special', key: 'f4', label: 'F4' },
    { kind: 'special', key: 'f5', label: 'F5' },
    { kind: 'special', key: 'f6', label: 'F6' },
  ],
  [
    { kind: 'special', key: 'f7', label: 'F7' },
    { kind: 'special', key: 'f8', label: 'F8' },
    { kind: 'special', key: 'f9', label: 'F9' },
    { kind: 'special', key: 'f10', label: 'F10' },
    { kind: 'special', key: 'f11', label: 'F11' },
    { kind: 'special', key: 'f12', label: 'F12' },
  ],
];

const KEY_ROWS_BY_LAYER: Record<ExtraKeyLayerName, ExtraKeyDefinition[][]> = {
  function: FUNCTION_KEY_ROWS,
  select: [],
  special: SPECIAL_KEY_ROWS,
};

export const EXTRA_KEY_LABELS = SPECIAL_KEY_ROWS.flatMap((row) => {
  return row.map((definition) => {
    return definition.label;
  });
});

export const FUNCTION_KEY_LABELS = FUNCTION_KEY_ROWS.flatMap((row) => {
  return row.map((definition) => {
    return definition.label;
  });
});


export type ExtraKeysRowProps = {
  armedModifier: TerminalModifierName | null;
  isSelectionAcceptable: boolean;
  isApplicationCursorMode: boolean;
  isConnected: boolean;
  isKeyboardVisible: boolean;
  isLandscape: boolean;
  onModifierLongPress(modifier: TerminalModifierName): void;
  onModifierTap(modifier: TerminalModifierName): void;
  onModifierUsed(): void;
  onSelectionAccept(): void;
  onSelectionMarkerTap(marker: TerminalSelectionMarkerName): void;
  onSelectionToggle(): void;
  onToggleKeyboard(): void;
  onWrite(sequence: string): void;
  selection: TerminalSelectionState | null;
};

const isModifierActive = (
  definition: ExtraKeyDefinition,
  armedModifier: TerminalModifierName | null
): boolean => {
  return definition.kind === 'modifier' && definition.modifier === armedModifier;
};

const keyboardIconNameOf = (isKeyboardVisible: boolean): 'keyboard' | 'keyboard-off' => {
  if (isKeyboardVisible) {
    return 'keyboard';
  }
  return 'keyboard-off';
};

const layerIconNameOf = (
  layerName: ExtraKeyLayerName
): 'layers' | 'layers-outline' | 'select-marker' => {
  if (layerName === 'special') {
    return 'layers-outline';
  }
  if (layerName === 'function') {
    return 'layers';
  }
  return 'select-marker';
};

const nextLayerName = (layerName: ExtraKeyLayerName): ExtraKeyLayerName => {
  const currentIndex = EXTRA_KEY_LAYER_ORDER.indexOf(layerName);
  const next = EXTRA_KEY_LAYER_ORDER[(currentIndex + 1) % EXTRA_KEY_LAYER_ORDER.length];
  if (next === undefined) {
    return layerName;
  }
  return next;
};

export function ExtraKeysRow({
  armedModifier,
  isSelectionAcceptable,
  isApplicationCursorMode,
  isConnected,
  isKeyboardVisible,
  isLandscape,
  onModifierLongPress,
  onModifierTap,
  onModifierUsed,
  onSelectionAccept,
  onSelectionMarkerTap,
  onSelectionToggle,
  onToggleKeyboard,
  onWrite,
  selection,
}: ExtraKeysRowProps) {
  const [layerName, setLayerName] = useState<ExtraKeyLayerName>('special');
  const [wasSelecting, setWasSelecting] = useState(false);

  // An ended selection drops the bar back to the first layer, so accepting a
  // copy or cancelling never strands the user on the selection keys.
  const isSelecting = selection !== null;
  if (wasSelecting !== isSelecting) {
    setWasSelecting(isSelecting);
    if (!isSelecting) {
      setLayerName('special');
    }
  }

  const writeSequence = (sequence: string) => {
    onWrite(modifierInput.composeSequence({ modifier: armedModifier, sequence }));
    if (armedModifier !== null) {
      onModifierUsed();
    }
  };

  const handleKeyPress = (definition: ExtraKeyDefinition) => {
    if (definition.kind === 'special') {
      writeSequence(keySequences.sequenceFor({ key: definition.key, isApplicationCursorMode }));
      return;
    }
    if (definition.kind === 'char') {
      writeSequence(definition.char);
      return;
    }
    onModifierTap(definition.modifier);
  };

  const handleKeyLongPress = (definition: ExtraKeyDefinition) => {
    if (definition.kind === 'char' && definition.longPressChar !== null) {
      writeSequence(definition.longPressChar);
      return;
    }
    if (definition.kind === 'modifier') {
      onModifierLongPress(definition.modifier);
    }
  };

  const handleLayerToggle = () => {
    setLayerName(nextLayerName(layerName));
  };

  // An active selection always surfaces its own layer so the marker and copy
  // keys are reachable right after a long-press starts selecting.
  const activeLayerName = isSelecting ? 'select' : layerName;

  return (
    <View style={[styles.bar, isLandscape && styles.barLandscape]} testID="extra-keys-bar">
      <View style={[styles.keyRows, isLandscape && styles.keyRowsLandscape]} testID="extra-keys-groups">
        {activeLayerName === 'select' ? (
          <View style={[styles.keyRow, styles.selectionKeyRow, isLandscape && styles.keyColumn]}>
            <Pressable
              accessibilityLabel={selection === null ? 'Start selection' : 'Cancel selection'}
              accessibilityRole="button"
              onPress={onSelectionToggle}
              style={[styles.key, isLandscape && styles.keyLandscape]}
            >
              <Text style={styles.keyLabel}>{selection === null ? 'SELECT' : 'CANCEL'}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Select from marker"
              accessibilityRole="button"
              disabled={selection === null}
              onPress={() => {
                onSelectionMarkerTap('from');
              }}
              style={[
                styles.key,
                isLandscape && styles.keyLandscape,
                selection?.activeMarker === 'from' && styles.keyActive,
                selection === null && styles.keyDisabled,
              ]}
            >
              <Text style={styles.keyLabel}>FROM</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Select to marker"
              accessibilityRole="button"
              disabled={selection === null}
              onPress={() => {
                onSelectionMarkerTap('to');
              }}
              style={[
                styles.key,
                isLandscape && styles.keyLandscape,
                selection?.activeMarker === 'to' && styles.keyActive,
                selection === null && styles.keyDisabled,
              ]}
            >
              <Text style={styles.keyLabel}>TO</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Accept selection"
              accessibilityRole="button"
              disabled={selection === null || !isSelectionAcceptable}
              onPress={onSelectionAccept}
              style={[
                styles.key,
                isLandscape && styles.keyLandscape,
                (selection === null || !isSelectionAcceptable) && styles.keyDisabled,
              ]}
            >
              <Text style={styles.keyLabel}>COPY</Text>
            </Pressable>
          </View>
        ) : (
          KEY_ROWS_BY_LAYER[activeLayerName].map((row, rowIndex) => {
            return (
              <View key={rowIndex} style={[styles.keyRow, isLandscape && styles.keyColumn]}>
                {row.map((definition) => {
                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!isConnected}
                      key={definition.label}
                      onLongPress={() => {
                        handleKeyLongPress(definition);
                      }}
                      onPress={() => {
                        handleKeyPress(definition);
                      }}
                      style={[
                        styles.key,
                        isLandscape && styles.keyLandscape,
                        isModifierActive(definition, armedModifier) && styles.keyActive,
                        !isConnected && styles.keyDisabled,
                      ]}
                    >
                      <Text style={styles.keyLabel}>{definition.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </View>
      <View style={[styles.utilityColumn, isLandscape && styles.utilityRow]}>
        {activeLayerName === 'select' ? null : (
          <Pressable
            accessibilityLabel="Toggle keyboard"
            accessibilityRole="button"
            onPress={onToggleKeyboard}
            style={styles.utilityKey}
          >
            <MaterialCommunityIcons
              color={constant.terminal.fg}
              name={keyboardIconNameOf(isKeyboardVisible)}
              size={18}
            />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="Extra key layers"
          accessibilityRole="button"
          onPress={handleLayerToggle}
          style={styles.utilityKey}
        >
          <MaterialCommunityIcons
            color={constant.terminal.fg}
            name={layerIconNameOf(activeLayerName)}
            size={18}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#111111',
    flexDirection: 'row',
    gap: 2,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  barLandscape: {
    flexDirection: 'column',
  },
  keyRows: {
    flex: 1,
  },
  keyRowsLandscape: {
    flexDirection: 'row',
    gap: 2,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  selectionKeyRow: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  keyColumn: {
    flex: 1,
    flexDirection: 'column',
  },
  utilityColumn: {
    flexDirection: 'column',
    gap: 2,
    marginTop: 2,
    width: 52,
  },
  utilityRow: {
    flexDirection: 'row',
    width: '100%',
  },
  utilityKey: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  key: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  keyLandscape: {
    width: 52,
  },
  keyActive: {
    backgroundColor: '#5c5c8a',
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    color: constant.terminal.fg,
    fontSize: 13,
  },
});
