import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { absoluteUrl } from '../config/env';

type Props = {
  uri?: string;
  // ¿Esta tarjeta es la activa? -> reproduce; si no, se queda en pausa (pero el
  // jugador montado ya bufferiza por delante = arranque instantaneo al activarse).
  isActive: boolean;
  muted: boolean;
};

// VideoSide — un lado de la publicacion con un REPRODUCTOR NATIVO (expo-video:
// ExoPlayer en Android / AVPlayer en iOS). Para usar tu propio reproductor,
// sustituye SOLO este componente manteniendo las props (uri, isActive, muted).
export function VideoSide({ uri, isActive, muted }: Props) {
  const source = absoluteUrl(uri) ?? '';
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      /* ignore */
    }
  }, [muted, player]);

  useEffect(() => {
    try {
      if (isActive) player.play();
      else player.pause();
    } catch {
      /* ignore */
    }
  }, [isActive, player]);

  return (
    <View style={styles.fill}>
      <VideoView
        style={styles.fill}
        player={player}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%', backgroundColor: '#000' },
});
