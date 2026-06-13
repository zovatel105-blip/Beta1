import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { absoluteUrl } from '../config/env';

type Props = {
  uri?: string;
  // ¿Esta tarjeta es la activa? -> reproduce; si no, se queda en pausa (pero el
  // jugador montado ya bufferiza por delante = arranque instantáneo al activarse).
  isActive: boolean;
  muted: boolean;
};

// VideoSide — un lado de la publicación con un REPRODUCTOR NATIVO (expo-video:
// ExoPlayer en Android / AVPlayer en iOS).
//
// COMPATIBLE CON RECICLAJE (FlashList): cuando esta vista se reutiliza para OTRA
// publicación, el reproductor es el MISMO pero la `uri` cambia. En vez de
// recrear el reproductor (caro: nuevo decoder + buffer), SUSTITUIMOS la fuente
// con player.replace() -> reutilización real del decoder nativo (view pooling).
export function VideoSide({ uri, isActive, muted }: Props) {
  const source = absoluteUrl(uri) ?? '';
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const lastSourceRef = useRef(source);

  // Reciclaje: si la fuente cambia (misma vista, otra publicación), reemplaza
  // la fuente en el reproductor existente (no se recrea).
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
