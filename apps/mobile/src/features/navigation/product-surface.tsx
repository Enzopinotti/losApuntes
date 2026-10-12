import type { ReactNode, RefObject } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  type ScrollView as ScrollViewInstance,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ProductSurfaceProps {
  title: string;
  description: string;
  children?: ReactNode;
  onRefresh?: (() => void) | undefined;
  refreshing?: boolean;
  scrollViewRef?: RefObject<ScrollViewInstance | null> | undefined;
  onScroll?:
    ((event: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined;
  onScrollLayout?: ((event: LayoutChangeEvent) => void) | undefined;
  onContentSizeChange?: ((width: number, height: number) => void) | undefined;
}

export function ProductSurface({
  title,
  description,
  children,
  onRefresh,
  refreshing = false,
  scrollViewRef,
  onScroll,
  onScrollLayout,
  onContentSizeChange,
}: ProductSurfaceProps) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <ScrollView
        ref={scrollViewRef}
        onScroll={onScroll}
        onLayout={onScrollLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const productSurfaceStyles = StyleSheet.create({
  card: {
    gap: 8,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  cardCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5b5b66",
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7fb",
  },
  content: {
    flexGrow: 1,
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  heading: {
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#17171c",
  },
  description: {
    maxWidth: 560,
    fontSize: 16,
    lineHeight: 24,
    color: "#55555f",
  },
});
