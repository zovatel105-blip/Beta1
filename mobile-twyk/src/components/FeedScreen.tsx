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

// FeedScreen — feed vertical tipo TikTok con RECICLAJE REAL DE VISTAS.
//
// Usa @shopify/flash-list (v2), que recicla las celdas (view pooling): al
// deslizar, reutiliza los componentes ya montados y solo les pasa nuevos datos,
// en lugar de destruirlos y recrearlos. El estado por-publicación vive en
// useFeedInteractions (FUERA de las celdas) -> reciclaje sin estado contaminado.
export function FeedScreen() {
  const { posts, ready, loadMore } = useFeed();
  const { byId, vote, toggleSave, toggleFollow } = useFeedInteractions();
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

  // getItemType agrupa por tipo de publicación -> FlashList mantiene pools de
  // reciclaje separados para vistas homogéneas ('versus' / 'duet') = reciclaje
  // más eficiente (reutiliza una celda 'versus' solo con otra 'versus').
  const getItemType = useCallback((item: Post) => item.type, []);

  // extraData cambia de identidad cuando cambian las interacciones o la tarjeta
  // activa -> FlashList vuelve a renderizar las celdas RECICLADAS con los datos
  // nuevos (sin recrear las vistas).
  const extraData = useMemo(() => ({ byId, activeIndex }), [byId, activeIndex]);

  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const it = resolveInteraction(byId, item.id, item.votes);
      return (
        <VersusCard
          post={item}
          isActive={index === activeIndex}
          // Monta el reproductor de la tarjeta ACTIVA y la SIGUIENTE (precarga)
          // -> arranque instantáneo al deslizar; el resto solo muestra póster.
          shouldMount={index === activeIndex || index === activeIndex + 1}
          itemHeight={height}
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
    [byId, activeIndex, height, vote, toggleSave, toggleFollow]
  );

  if (!ready || posts.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
});
