import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Volume2, VolumeX } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// TopBar — réplica nativa de la barra superior web: mute (izq), tabs
// "Siguiendo / Para ti" (centro), buscar (der), sobre un degradado superior.
type Props = {
  muted: boolean;
  onToggleMute: () => void;
};

export function TopBar({ muted, onToggleMute }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Pressable style={styles.circle} onPress={onToggleMute}>
        {muted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
      </Pressable>

      <View style={styles.tabs}>
        <Text style={styles.tabInactive}>Siguiendo</Text>
        <View>
          <Text style={styles.tabActive}>Para ti</Text>
          <View style={styles.underline} />
        </View>
      </View>

      <Pressable style={styles.circle}>
        <Search size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  tabInactive: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
  tabActive: { color: '#fff', fontSize: 15, fontWeight: '600' },
  underline: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
});

export default TopBar;
