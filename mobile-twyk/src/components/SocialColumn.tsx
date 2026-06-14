import { memo } from 'react';
import { Bookmark, MessageCircle, MoreVertical, Swords } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { absoluteUrl } from '../config/env';
import { VoteIcon } from './icons/VoteIcon';
import { ShareIcon } from './icons/ShareIcon';

// SocialColumn — réplica nativa de la columna social web (mismos iconos,
// tamaños y posiciones). Presentacional y reciclable (sin estado interno).

function fmt(n?: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
}
function label(n: number | undefined, placeholder: string): string {
  return (Number(n) || 0) === 0 ? placeholder : fmt(n);
}

type Props = {
  avatarUrl?: string;
  totalVotes: number;
  userVote: 'a' | 'b' | null;
  comments?: number;
  shares?: number;
  saves?: number;
  saved: boolean;
  showRetar?: boolean;
  onRetar?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onSave: () => void;
  onMore?: () => void;
};

export const SocialColumn = memo(function SocialColumn({
  avatarUrl,
  totalVotes,
  userVote,
  comments,
  shares,
  saves,
  saved,
  showRetar = true,
  onRetar,
  onComment,
  onShare,
  onSave,
  onMore,
}: Props) {
  const avatar = absoluteUrl(avatarUrl);
  const voteColor = userVote === 'a' ? '#A855F7' : userVote === 'b' ? '#3B82F6' : '#fff';

  return (
    <View style={styles.col} pointerEvents="box-none">
      {/* Voto (el voto real se emite tocando el vídeo; aquí el contador) */}
      <View style={styles.item}>
        <VoteIcon size={36} color={voteColor} filled={!!userVote} strokeWidth={180} />
        <Text style={styles.label}>{label(totalVotes, 'Votar')}</Text>
      </View>

      {showRetar ? (
        <Pressable style={styles.item} onPress={onRetar} hitSlop={6}>
          <Swords size={25} color="#fff" strokeWidth={1.25} />
          <Text style={styles.label}>Retar</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.item} onPress={onComment} hitSlop={6}>
        <MessageCircle size={25} color="#fff" strokeWidth={1.25} />
        <Text style={styles.label}>{label(comments, 'Comentar')}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={onShare} hitSlop={6}>
        <ShareIcon size={25} color="#fff" strokeWidth={1.1} />
        <Text style={styles.label}>{label(shares, 'Compartir')}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={onSave} hitSlop={6}>
        <Bookmark
          size={25}
          color={saved ? '#FACC15' : '#fff'}
          fill={saved ? '#FACC15' : 'none'}
          strokeWidth={1.25}
        />
        <Text style={styles.label}>{label(saves, 'Guardar')}</Text>
      </Pressable>

      <Pressable style={styles.itemTight} onPress={onMore} hitSlop={6}>
        <MoreVertical size={18} color="#fff" fill="#fff" strokeWidth={1.25} />
      </Pressable>

      {/* Disco de avatar girando (estático aquí) */}
      <View style={styles.disc}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.discAvatar} />
        ) : (
          <View style={[styles.discAvatar, styles.discFallback]} />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    right: 4,
    bottom: 72,
    alignItems: 'center',
    gap: 16,
  },
  item: { alignItems: 'center', gap: 2 },
  itemTight: { alignItems: 'center' },
  label: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 2 },
  },
  disc: {
    marginTop: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  discAvatar: { width: 24, height: 24, borderRadius: 12 },
  discFallback: { backgroundColor: '#3f3f46' },
});

export default SocialColumn;
