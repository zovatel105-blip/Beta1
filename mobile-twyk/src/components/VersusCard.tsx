import { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  LayoutAnimation,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';

import { absoluteUrl } from '../config/env';
import { Post } from '../types';
import { Votes } from '../hooks/useFeedInteractions';
import { VideoSide } from './VideoSide';
import { SocialColumn } from './SocialColumn';
import { VoteIcon } from './icons/VoteIcon';

// Habilita LayoutAnimation en Android para animar el cambio de tamaño de los
// puntitos del carrusel (igual que la transición suave `duration-200` de la web).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Transición suave de los dots: el dot activo crece/encoge como en la web.
function animateDots() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY),
  );
}

// VersusCard — réplica nativa de la tarjeta carrusel web (CarouselSlide):
// carrusel horizontal de 2 vídeos (A/B), swipe para comparar, doble toque para
// votar, dots, barra de progreso, info inferior (avatar+nombre+Seguir+título) y
// columna social. 100% PRESENTACIONAL salvo el índice de lado (UI efímera).

type Props = {
  post: Post;
  isActive: boolean;
  shouldMount: boolean;
  itemHeight: number;
  muted: boolean;
  votes: Votes;
  userVote: 'a' | 'b' | null;
  saved: boolean;
  following: boolean;
  onVote: (id: string, side: 'a' | 'b', base: Votes) => void;
  onToggleSave: (id: string, base: Votes) => void;
  onToggleFollow: (id: string, base: Votes) => void;
};

export const VersusCard = memo(function VersusCard({
  post,
  isActive,
  shouldMount,
  itemHeight,
  muted,
  votes,
  userVote,
  saved,
  following,
  onVote,
  onToggleSave,
  onToggleFollow,
}: Props) {
  const { width } = useWindowDimensions();
  const [sideIdx, setSideIdx] = useState(0); // 0 = A, 1 = B
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const lastTapRef = useRef(0);

  // Burst del icono de voto al votar (mismo gesto que la web).
  const burst = useRef(new Animated.Value(0)).current;
  const [burstColor, setBurstColor] = useState('#A855F7');

  const base = post.votes ?? { a: 0, b: 0 };
  const total = (votes.a || 0) + (votes.b || 0);

  const sideA = post.sideA ?? {};
  const sideB = post.sideB ?? {};
  const current = sideIdx === 0 ? sideA : sideB;
  const sideKey: 'a' | 'b' = sideIdx === 0 ? 'a' : 'b';

  const authorA = sideA.author ?? post.author ?? {};
  const authorB = sideB.author ?? post.author ?? {};
  const headAuthor = current.author ?? post.author ?? {};
  const avatar = absoluteUrl(headAuthor.avatarUrl);

  const displayName = post.isChallenge
    ? `${authorA.username || authorA.name || ''} vs ${authorB.username || authorB.name || ''}`
    : headAuthor.username || headAuthor.name || 'Twyk';

  // Reset al RECICLARSE la vista para otra publicación (FlashList).
  useEffect(() => {
    setSideIdx(0);
    setProgress(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [post.id]);

  // Reinicia el progreso al cambiar de lado (vídeo distinto).
  useEffect(() => {
    setProgress(0);
  }, [sideIdx]);

  const playBurst = (s: 'a' | 'b') => {
    setBurstColor(s === 'a' ? '#A855F7' : '#3B82F6');
    burst.setValue(0);
    Animated.timing(burst, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  };

  const handleTap = (s: 'a' | 'b') => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!userVote) {
        onVote(post.id, s, base);
        playBurst(s);
      }
    }
    lastTapRef.current = now;
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    animateDots();
    setSideIdx(Math.max(0, Math.min(1, idx)));
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    animateDots();
    setSideIdx(i);
  };

  const renderPage = (side: typeof sideA, key: 'a' | 'b') => {
    const poster = absoluteUrl(side?.posterUrl);
    const isVisible = (key === 'a') === (sideIdx === 0);
    return (
      <Pressable style={{ width, height: itemHeight }} onPress={() => handleTap(key)}>
        {poster ? <Image source={{ uri: poster }} style={styles.posterFill} /> : null}
        {shouldMount && side?.videoUrl ? (
          <VideoSide
            uri={side.videoUrl}
            isActive={isActive && isVisible}
            muted={muted || !isVisible}
            onProgress={isVisible ? setProgress : undefined}
          />
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.card, { height: itemHeight }]}>
      {/* Carrusel horizontal (2 vídeos) */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={StyleSheet.absoluteFill}
      >
        {renderPage(sideA, 'a')}
        {renderPage(sideB, 'b')}
      </ScrollView>

      {/* Pista para votar (arriba) */}
      {!userVote ? (
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hint}>Desliza para comparar · doble toque para votar</Text>
        </View>
      ) : null}

      {/* Burst del icono de voto */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.burst,
          {
            opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) },
              { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
            ],
          },
        ]}
      >
        <VoteIcon size={96} color={burstColor} filled strokeWidth={180} />
      </Animated.View>

      {/* Info INFERIOR: avatar + nombre + Seguir + título */}
      <View style={styles.bottomInfo} pointerEvents="box-none">
        <View style={styles.authorRow}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          <Text style={styles.authorName} numberOfLines={1}>
            {displayName}
          </Text>
          <Pressable
            onPress={() => onToggleFollow(post.id, base)}
            hitSlop={6}
            style={[styles.followBtn, following && styles.followBtnActive]}
          >
            <Text style={styles.followText}>{following ? 'Siguiendo' : 'Seguir'}</Text>
          </Pressable>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {current.description || post.description || (post.isChallenge ? 'Reto 1vs1' : 'Twyk')}
        </Text>
      </View>

      {/* Columna social */}
      <SocialColumn
        avatarUrl={headAuthor.avatarUrl}
        totalVotes={total}
        userVote={userVote}
        comments={post.stats?.comments}
        shares={post.stats?.shares}
        saves={post.stats?.saves}
        saved={saved}
        onSave={() => onToggleSave(post.id, base)}
      />

      {/* Puntitos del carrusel */}
      <View style={styles.dots}>
        {[0, 1].map((i) => (
          <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
            <View style={[styles.dot, sideIdx === i ? styles.dotActive : styles.dotInactive]} />
          </Pressable>
        ))}
      </View>

      {/* Barra de progreso (línea fina, avanza con el vídeo) */}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  posterFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  hintWrap: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hint: { color: '#fff', fontSize: 10, fontWeight: '600', includeFontPadding: false },
  burst: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Info inferior
  bottomInfo: { position: 'absolute', bottom: 80, left: 16, right: 64 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarFallback: { backgroundColor: '#222' },
  authorName: {
    flexShrink: 1,
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  followBtnActive: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  followText: { color: '#fff', fontWeight: '500', fontSize: 13, includeFontPadding: false },
  title: {
    color: '#fff',
    fontSize: 14,
    marginTop: 4,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  // Dots
  dots: {
    position: 'absolute',
    bottom: 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: { borderRadius: 999 },
  dotActive: { width: 16, height: 3, backgroundColor: '#fff' },
  dotInactive: { width: 3, height: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  // Progress bar
  progressTrack: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: { height: 2, width: '0%', backgroundColor: 'rgba(255,255,255,0.8)' },
});

export default VersusCard;
