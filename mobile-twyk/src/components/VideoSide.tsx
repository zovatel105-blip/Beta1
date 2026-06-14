import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { absoluteUrl } from '../config/env';

type Props = {
  uri?: string;
  isActive: boolean;
  muted: boolean;
  // Reporta el progreso (0..1) del vídeo VISIBLE para la barra de progreso.
  onProgress?: (ratio: number) => void;
};

// VideoSide — reproductor NATIVO (expo-video). Compatible con reciclaje:
// sustituye la fuente con player.replace() en vez de recrear el reproductor.
export function VideoSide({ uri, isActive, muted, onProgress }: Props) {
  const source = absoluteUrl(uri) ?? '';
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const lastSourceRef = useRef(source);

  useEffect(() => {
    if (lastSourceRef.current !== source) {
      lastSourceRef.current = source;
      try {
        player.replace(source);
      } catch {
        /* ignore */
      }
    }
  }, [source, player]);

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

  // Progreso del vídeo (para la barra fina inferior, igual que la web).
  useEffect(() => {
    if (!isActive || !onProgress) return;
    const id = setInterval(() => {
      try {
        const d = player.duration || 0;
        const t = player.currentTime || 0;
        if (d > 0) onProgress(Math.max(0, Math.min(1, t / d)));
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearInterval(id);
  }, [isActive, onProgress, player]);

  return (
    <View style={styles.fill}>
      <VideoView style={styles.fill} player={player} contentFit="cover" nativeControls={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%', backgroundColor: '#000' },
});

export default VideoSide;
