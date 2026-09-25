import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemedTextInput } from '@/components/themed-text-input';

jest.mock('@/hooks/use-color-scheme', () => {
  return { useColorScheme: () => 'dark' };
});

describe('ThemedTextInput', () => {
  it('renders input text visible against the dark background', async () => {
    await render(<ThemedTextInput onChangeText={jest.fn()} placeholder="host" value="" />);
    const input = screen.getByPlaceholderText('host');
    const flattenedStyle = StyleSheet.flatten(input.props.style);
    expect(flattenedStyle.color).toBe('#ffffff');
    expect(flattenedStyle.borderColor).toBe('#B0B4BA');
    expect(input.props.placeholderTextColor).toBe('#B0B4BA');
  });

  it('lets consumer styles extend the themed base', async () => {
    await render(
      <ThemedTextInput
        onChangeText={jest.fn()}
        placeholder="key"
        style={{ fontFamily: 'monospace', minHeight: 96 }}
        value=""
      />,
    );
    const flattenedStyle = StyleSheet.flatten(screen.getByPlaceholderText('key').props.style);
    expect(flattenedStyle.fontFamily).toBe('monospace');
    expect(flattenedStyle.minHeight).toBe(96);
    expect(flattenedStyle.borderWidth).toBe(1);
    expect(flattenedStyle.color).toBe('#ffffff');
  });
});
