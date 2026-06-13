import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { absoluteUrl } from '../config/env';

// SocialColumn — la columna de acciones (voto / comentario / compartir /
// guardar + avatar). Es una vista PRESENTACIONAL y RECICLABLE: FlashList la
// reutiliza para cada publicación y solo le pasa nuevos DATOS por props (no se
// destruye ni se recrea al deslizar). Sin estado interno -> 100% recycle-safe.

function fmt(n?: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
}

type Props = {
  avatarUrl?: string;
  totalVotes: number;
  voted: boolean;
  comments?: number;
  shares?: number;
  saves?: number;
  saved: boolean;
  onComment?: () => void;
  onShare?: () => void;
  onSave: () => void;
};

export const SocialColumn = memo(function SocialColumn({
  avatarUrl,
  totalVotes,
  voted,
  comments,
  shares,
  saves,
  saved,
  onComment,
  onShare,
  onSave,
}: Props) {
  const avatar = absoluteUrl(avatarUrl);
  return (
    <View style={styles.col} pointerEvents="box-none">
      {/* Voto (el voto se emite tocando un vídeo; aquí mostramos el total) */}
      <View style={styles.item}>
        <Ionicons
          name={voted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
          size={38}
          color={voted ? '#A855F7' : '#fff'}
        />
        <Text style={styles.label}>{totalVotes > 0 ? fmt(totalVotes) : 'Votar'}</Text>
      </View>

      <Pressable style={styles.item} onPress={onComment} hitSlop={8}>
        <Ionicons name="chatbubble-ellipses" size={31} color="#fff" />
        <Text style={styles.label}>{(comments ?? 0) > 0 ? fmt(comments) : 'Comentar'}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={onShare} hitSlop={8}>
        <Ionicons name="arrow-redo" size={31} color="#fff" />
        <Text style={styles.label}>{(shares ?? 0) > 0 ? fmt(shares) : 'Compartir'}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={onSave} hitSlop={8}>
        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={30} color={saved ? '#FACC15' : '#fff'} />
        <Text style={styles.label}>{(saves ?? 0) > 0 ? fmt(saves) : 'Guardar'}</Text>
      </Pressable>

      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    right: 8,
    bottom: 90,
    alignItems: 'center',
    gap: 18,
  },
  item: { alignItems: 'center', gap: 2 },
  label: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarFallback: { backgroundColor: '#222' },
});
