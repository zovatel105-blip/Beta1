import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { useFeed } from '../hooks/useFeed';
import { Post } from '../types';
import { VersusCard } from './VersusCard';

export function FeedScreen() {
  const { posts, ready, loadMore } = useFeed();
  const { height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const keyExtractor = useCallback((item: Post) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => (
      <VersusCard
        post={item}
        isActive={index === activeIndex}
        // Monta el reproductor de la tarjeta ACTIVA y la SIGUIENTE (precarga) ->
        // arranque instantaneo al deslizar. El resto solo muestra poster.
        shouldMount={index === activeIndex || index === activeIndex + 1}
        itemHeight={height}
      />
    ),
    [activeIndex, height]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Post> | null | undefined, index: number) => ({
      length: height,
      offset: height * index,
      index,
    }),
    [height]
  );

  if (!ready || posts.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      pagingEnabled
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      windowSize={3}
      maxToRenderPerBatch={2}
      initialNumToRender={2}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
});
