import { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { sendVote } from '../api/client';
import { absoluteUrl } from '../config/env';
import { Post, Side } from '../types';
import { VideoSide } from './VideoSide';

type Props = {
  post: Post;
  isActive: boolean;
  // shouldMount: montar el reproductor (activa + siguiente) para precargar; el
  // resto muestra solo el poster (0 decoders) y se monta al acercarse.
  shouldMount: boolean;
  itemHeight: number;
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
  votes: { a: number; b: number };
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
      {side?.author?.username ? (
        <Text style={styles.author} numberOfLines={1}>
          @{side.author.username}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const VersusCard = memo(function VersusCard({ post, isActive, shouldMount, itemHeight }: Props) {
  const [votes, setVotes] = useState<{ a: number; b: number }>({
    a: post.votes?.a || 0,
    b: post.votes?.b || 0,
  });
  const [userVote, setUserVote] = useState<'a' | 'b' | null>(null);

  const vote = async (side: 'a' | 'b') => {
    if (userVote) return;
    setUserVote(side);
    setVotes((v) => ({ ...v, [side]: (v[side] || 0) + 1 }));
    try {
      const data = await sendVote(post.id, side);
      if (data?.votes) setVotes(data.votes);
    } catch {
      /* mantiene el optimista */
    }
  };

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
        onVote={vote}
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
        onVote={vote}
      />
      {/* Cabecera */}
      <View style={styles.header} pointerEvents="none">
        <Text style={styles.headerTitle} numberOfLines={2}>
          {post.description || (post.isChallenge ? 'Reto 1vs1' : 'Twyk')}
        </Text>
        {!userVote ? <Text style={styles.hint}>Toca una opción para votar</Text> : null}
      </View>
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
  author: {
    position: 'absolute',
    bottom: 14,
    left: 12,
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
});
