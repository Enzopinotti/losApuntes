import type { ReactElement, ReactNode, RefObject } from "react";
import {
  FlatList,
  type FlatList as FlatListInstance,
  type ListRenderItem,
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

export interface ProductSurfaceListProps<T> {
  listKey?: string | undefined;
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  ref?: RefObject<FlatListInstance<T> | null> | undefined;
  footer?: ReactElement | null;
  onEndReached?: (() => void) | undefined;
  onEndReachedThreshold?: number | undefined;
}

interface ProductSurfaceProps<T = never> {
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
  flatList?: ProductSurfaceListProps<T> | undefined;
}

export function ProductSurface<T = never>({
  title,
  description,
  children,
  onRefresh,
  refreshing = false,
  scrollViewRef,
  onScroll,
  onScrollLayout,
  onContentSizeChange,
  flatList,
}: ProductSurfaceProps<T>) {
  const heading = (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      {flatList ? (
        <FlatList
          key={flatList.listKey}
          ref={flatList.ref}
          data={flatList.data}
          renderItem={flatList.renderItem}
          keyExtractor={flatList.keyExtractor}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {heading}
              {children}
            </View>
          }
          ListFooterComponent={flatList.footer}
          onEndReached={flatList.onEndReached}
          onEndReachedThreshold={flatList.onEndReachedThreshold ?? 0.6}
          onScroll={onScroll}
          onLayout={onScrollLayout}
          onContentSizeChange={onContentSizeChange}
          scrollEventThrottle={16}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        />
      ) : (
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
          {heading}
          {children}
        </ScrollView>
      )}
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
  listHeader: {
    gap: 20,
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
