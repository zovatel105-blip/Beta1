import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { absoluteUrl } from '../config/env';
import { Post, Side } from '../types';
import { Votes } from '../hooks/useFeedInteractions';
import { VideoSide } from './VideoSide';
import { SocialColumn } from './SocialColumn';

// VersusCard — tarjeta 1vs1 (2 vídeos + votación + columna social).
//
// IMPORTANTE (view pooling): es 100% PRESENTACIONAL. NO tiene estado interno;
// recibe `votes`, `userVote`, `saved` y `following` por props desde el store del
// feed (keyed por id). Así, cuando FlashList RECICLA esta vista para otra
// publicación, solo cambian los DATOS (props) y nunca se arrastra estado de la
// publicación anterior. Los callbacks (onVote / onToggleSave / onToggleFollow)
// son ESTABLES (memoizados en el hook) -> el `memo` evita renders innecesarios.

type Props = {
  post: Post;
  isActive: boolean;
  // shouldMount: montar el reproductor (activa + siguiente) para precargar; el
  // resto muestra solo el póster (0 decoders) y se monta al acercarse.
  shouldMount: boolean;
  itemHeight: number;
  votes: Votes;
  userVote: 'a' | 'b' | null;
  saved: boolean;
  following: boolean;
  onVote: (id: string, side: 'a' | 'b', base: Votes) => void;
  onToggleSave: (id: string, base: Votes) => void;
  onToggleFollow: (id: string, base: Votes) => void;
};

function Half({
  side,
  sideKey,
  isActive,
  shouldMount,
  audible,
  votes,
  userVote,
  onVote,
}: {
  side?: Side;
  sideKey: 'a' | 'b';
  isActive: boolean;
  shouldMount: boolean;
  audible: boolean;
  votes: Votes;
  userVote: 'a' | 'b' | null;
  onVote: (s: 'a' | 'b') => void;
}) {
  const total = (votes.a || 0) + (votes.b || 0);
  const pct = total > 0 ? Math.round(((votes[sideKey] || 0) / total) * 100) : 50;
  const poster = absoluteUrl(side?.posterUrl);
  const chosen = userVote === sideKey;
  return (
    <Pressable style={styles.half} onPress={() => onVote(sideKey)}>
      {poster ? <Image source={{ uri: poster }} style={styles.posterFill} /> : null}
      {shouldMount && side?.videoUrl ? (
        <VideoSide uri={side.videoUrl} isActive={isActive} muted={!audible || !isActive} />
      ) : null}
      {/* Etiqueta + porcentaje */}
      <View style={[styles.badge, chosen && styles.badgeChosen]}>
        <Text style={styles.badgeLabel}>{sideKey === 'a' ? 'A' : 'B'}</Text>
        {userVote ? <Text style={styles.badgePct}>{pct}%</Text> : null}
      </View>
    </Pressable>
  );
}

export const VersusCard = memo(function VersusCard({
  post,
  isActive,
  shouldMount,
  itemHeight,
  votes,
  userVote,
  saved,
  following,
  onVote,
  onToggleSave,
  onToggleFollow,
}: Props) {
  const base = post.votes ?? { a: 0, b: 0 };
  const total = (votes.a || 0) + (votes.b || 0);

  const authorA = post.sideA?.author ?? post.author ?? {};
  const authorB = post.sideB?.author ?? post.author ?? {};
  const headAuthor = authorA;
  const avatar = absoluteUrl(headAuthor.avatarUrl);

  // Nombre mostrado: en retos 1vs1 mostramos "userA vs userB"; en publicación
  // normal, el nombre/usuario del autor principal.
  const displayName = post.isChallenge
    ? `${authorA.username || authorA.name || ''} vs ${authorB.username || authorB.name || ''}`
    : headAuthor.username || headAuthor.name || 'Twyk';

  const handleVote = (side: 'a' | 'b') => onVote(post.id, side, base);

  return (
    <View style={[styles.card, { height: itemHeight }]}>
      <Half
        side={post.sideA}
        sideKey="a"
        isActive={isActive}
        shouldMount={shouldMount}
        audible
        votes={votes}
        userVote={userVote}
        onVote={handleVote}
      />
      <View style={styles.divider} />
      <Half
        side={post.sideB}
        sideKey="b"
        isActive={isActive}
        shouldMount={shouldMount}
        audible={false}
        votes={votes}
        userVote={userVote}
        onVote={handleVote}
      />

      {/* Info INFERIOR (como la web): avatar + nombre + Seguir + título. */}
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
          {post.description || (post.isChallenge ? 'Reto 1vs1' : 'Twyk')}
        </Text>
        {!userVote ? <Text style={styles.hint}>Toca una opción para votar</Text> : null}
      </View>

      {/* Columna social RECICLADA: misma vista para todas las publicaciones; al
          deslizar solo se actualizan sus datos (contadores, guardado, avatar). */}
      <SocialColumn
        avatarUrl={headAuthor.avatarUrl}
        totalVotes={total}
        voted={!!userVote}
        comments={post.stats?.comments}
        shares={post.stats?.shares}
        saves={post.stats?.saves}
        saved={saved}
        onSave={() => onToggleSave(post.id, base)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#000' },
  half: { flex: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  posterFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  divider: { height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  badgeChosen: { backgroundColor: 'rgba(168,85,247,0.85)' },
  badgeLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  badgePct: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // Info inferior
  bottomInfo: {
    position: 'absolute',
    bottom: 40,
    left: 12,
    right: 72,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
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
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  followBtnActive: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  followText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  title: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
});
