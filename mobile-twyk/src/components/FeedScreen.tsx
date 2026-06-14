import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFeed } from '../hooks/useFeed';
import { resolveInteraction, useFeedInteractions } from '../hooks/useFeedInteractions';
import { Post } from '../types';
import { VersusCard } from './VersusCard';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

// FeedScreen — pantalla del feed (réplica nativa de la web): TopBar arriba,
// feed vertical con reciclaje real de vistas (FlashList) y BottomNav abajo.
export function FeedScreen() {
  const { posts, ready, loadMore } = useFeed();
  const { byId, vote, toggleSave, toggleFollow } = useFeedInteractions();
  const { height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const keyExtractor = useCallback((item: Post) => item.id, []);
  const getItemType = useCallback((item: Post) => item.type, []);

  const extraData = useMemo(() => ({ byId, activeIndex, muted }), [byId, activeIndex, muted]);

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const it = resolveInteraction(byId, item.id, item.votes);
      return (
        <VersusCard
          post={item}
          isActive={index === activeIndex}
          shouldMount={index === activeIndex || index === activeIndex + 1}
          itemHeight={height}
          muted={muted}
          votes={it.votes}
          userVote={it.userVote}
          saved={it.saved}
          following={it.following}
          onVote={vote}
          onToggleSave={toggleSave}
          onToggleFollow={toggleFollow}
        />
      );
    },
    [byId, activeIndex, height, muted, vote, toggleSave, toggleFollow]
  );

  if (!ready || posts.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlashList
        data={posts}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={renderItem}
        extraData={extraData}
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />

      {/* Capas fijas: barra superior + navegación inferior */}
      <TopBar muted={muted} onToggleMute={() => setMuted((m) => !m)} />
      <BottomNav activeTab="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
});
