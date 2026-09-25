import { type JSX, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { type MD3Theme, Text } from 'react-native-paper';

import { useThemePreference } from '@/components/theme/theme-context';

export type ScrollableTabBarTab<TabKey extends string = string> = {
  key: TabKey;
  label: string;
}

export type ScrollableTabBarProps<TabKey extends string> = {
  activeKey: TabKey;
  onSelect: (key: TabKey) => void;
  tabs: readonly ScrollableTabBarTab<TabKey>[];
}

interface TabLayout {
  width: number;
  x: number;
}

interface ScrollFrame {
  contentWidth: number;
  viewportWidth: number;
}

const resolveTabLabelColor = (params: { isActive: boolean; md3Theme: MD3Theme }): string => {
  if (params.isActive) {
    return params.md3Theme.colors.onSurface;
  }

  return params.md3Theme.colors.onSurfaceVariant;
};

export const ScrollableTabBar = <TabKey extends string>({
  activeKey,
  onSelect,
  tabs,
}: ScrollableTabBarProps<TabKey>): JSX.Element => {
  const { md3Theme } = useThemePreference();
  const scrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef(new Map<TabKey, TabLayout>());
  const [scrollFrame, setScrollFrame] = useState<ScrollFrame>({ contentWidth: 0, viewportWidth: 0 });

  useEffect(() => {
    const activeLayout = tabLayoutsRef.current.get(activeKey);

    if (activeLayout === undefined) {
      return;
    }
    const maxOffset = scrollFrame.contentWidth - scrollFrame.viewportWidth;

    if (maxOffset <= 0) {
      return;
    }
    const centeredOffset = activeLayout.x + activeLayout.width / 2 - scrollFrame.viewportWidth / 2;
    const clampedOffset = Math.max(0, Math.min(centeredOffset, maxOffset));

    scrollRef.current?.scrollTo({ animated: true, x: clampedOffset });
  }, [activeKey, scrollFrame.contentWidth, scrollFrame.viewportWidth]);

  const handleBarLayout = (event: LayoutChangeEvent): void => {
    const viewportWidth = event.nativeEvent.layout.width;
    setScrollFrame((previous) => {
      return { ...previous, viewportWidth };
    });
  };

  const handleContentSizeChange = (contentWidth: number): void => {
    setScrollFrame((previous) => {
      return { ...previous, contentWidth };
    });
  };

  const renderTab = (tab: ScrollableTabBarTab<TabKey>): JSX.Element => {
    const isActive = tab.key === activeKey;

    const handleTabLayout = (event: LayoutChangeEvent): void => {
      tabLayoutsRef.current.set(tab.key, {
        width: event.nativeEvent.layout.width,
        x: event.nativeEvent.layout.x,
      });
    };

    const handleTabPress = (): void => {
      onSelect(tab.key);
    };

    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        key={tab.key}
        onLayout={handleTabLayout}
        onPress={handleTabPress}
        style={styles.tab}
      >
        <Text
          style={[
            styles.tabLabel,
            isActive && styles.tabLabelActive,
            { color: resolveTabLabelColor({ isActive, md3Theme }) },
          ]}
          variant="titleSmall"
        >
          {tab.label}
        </Text>
        {isActive && <View style={[styles.tabIndicator, { backgroundColor: md3Theme.colors.onSurface }]} />}
      </Pressable>
    );
  };

  return (
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.tabsContent}
      horizontal
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleBarLayout}
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}
      style={[
        styles.bar,
        { backgroundColor: md3Theme.colors.surface, borderBottomColor: md3Theme.colors.outlineVariant },
      ]}
    >
      {tabs.map(renderTab)}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
  },
  tab: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tabIndicator: {
    bottom: 0,
    height: 3,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  tabLabel: {
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabsContent: {
    paddingHorizontal: 4,
  },
});
