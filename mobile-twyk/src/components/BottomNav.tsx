import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, Inbox, Plus, Swords, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// BottomNav — réplica nativa de la barra inferior web (negra, esquinas
// superiores redondeadas): Home · Battle · + (borde degradado) · Inbox · Perfil.
type Props = {
  activeTab?: 'home' | 'explore' | 'messages' | 'profile';
  onGoHome?: () => void;
  onOpenBattles?: () => void;
  onOpenUpload?: () => void;
  onOpenInbox?: () => void;
  onOpenProfile?: () => void;
};

const ACTIVE = '#fff';
const INACTIVE = 'rgba(255,255,255,0.5)';

export function BottomNav({
  activeTab = 'home',
  onGoHome,
  onOpenBattles,
  onOpenUpload,
  onOpenInbox,
  onOpenProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.row}>
        <Pressable style={styles.item} onPress={onGoHome}>
          <Home
            size={20}
            color={activeTab === 'home' ? ACTIVE : INACTIVE}
            strokeWidth={activeTab === 'home' ? 2.5 : 1.5}
            fill={activeTab === 'home' ? '#fff' : 'none'}
          />
        </Pressable>

        <Pressable style={styles.item} onPress={onOpenBattles}>
          <Swords
            size={20}
            color={activeTab === 'explore' ? ACTIVE : INACTIVE}
            strokeWidth={activeTab === 'explore' ? 2.5 : 1.5}
          />
        </Pressable>

        {/* Crear — borde degradado lila -> azul */}
        <Pressable style={styles.plusWrap} onPress={onOpenUpload}>
          <LinearGradient
            colors={['#A855F7', '#3B82F6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.plusGrad}
          >
            <View style={styles.plusInner}>
              <Plus size={20} color="#fff" strokeWidth={2} />
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable style={styles.item} onPress={onOpenInbox}>
          <Inbox
            size={20}
            color={activeTab === 'messages' ? ACTIVE : INACTIVE}
            strokeWidth={activeTab === 'messages' ? 2.5 : 1.5}
          />
        </Pressable>

        <Pressable style={styles.item} onPress={onOpenProfile}>
          <User
            size={20}
            color={activeTab === 'profile' ? ACTIVE : INACTIVE}
            strokeWidth={activeTab === 'profile' ? 2.5 : 1.5}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  item: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  plusWrap: { width: 36, height: 36 },
  plusGrad: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusInner: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BottomNav;
