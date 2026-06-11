# Twyk Mobile (app nativa — Expo + React Native)

App nativa con **reproductor nativo real** (expo-video → ExoPlayer en Android /
AVPlayer en iOS) que reutiliza el **mismo backend** que tu web Twyk. Feed vertical
tipo TikTok, publicaciones 1vs1 (2 vídeos) y votación.

> Este proyecto NO se compila dentro de Emergent (no hay emulador). Se compila en
> TU máquina con Android Studio. Aquí solo está el código fuente listo para usar.

## 1) Requisitos en tu PC
- Node.js LTS (`node -v`)
- Android Studio + un SDK de Android instalado (tienes Android Studio ✅)
- Un teléfono Android (con depuración USB) o un emulador

## 2) Configurar la URL de tu backend (IMPORTANTE)
El teléfono NO puede acceder al `localhost` del contenedor. Edita:

```
src/config/env.ts  ->  API_BASE_URL
```

- Si tu web YA está desplegada: pon su URL pública (`https://...`).
- Para pruebas locales contra tu PC: usa la IP LAN de tu máquina (mismo WiFi que
  el móvil), p. ej. `http://192.168.1.50:3000`.

## 3) Instalar dependencias
```bash
cd mobile-twyk
npm install
# Alinea automáticamente las versiones de las librerías al SDK de Expo instalado:
npx expo install --fix
```

## 4) Generar el proyecto nativo y ejecutarlo
```bash
# Genera las carpetas android/ e ios/ a partir de la config de Expo
npx expo prebuild

# Compila e instala en tu dispositivo/emulador Android
npx expo run:android
```
También puedes abrir la carpeta `android/` resultante directamente en Android Studio.

## 5) Generar un APK de prueba
- Rápido (debug): el `expo run:android` ya instala la app en tu teléfono.
- APK release local:
  ```bash
  npx expo run:android --variant release
  ```
  El APK queda en `android/app/build/outputs/apk/release/`.
- O con build en la nube (necesita cuenta GRATIS de Expo):
  ```bash
  npm install -g eas-cli
  eas login
  eas build -p android --profile preview   # genera un APK descargable
  ```

## Estructura
```
mobile-twyk/
  App.tsx                      # raíz
  src/config/env.ts            # <-- pon aquí tu API_BASE_URL
  src/api/client.ts            # llamadas a /api/uploads, /api/feed, /api/vote
  src/hooks/useFeed.ts         # carga + scroll infinito (igual que la web)
  src/components/FeedScreen.tsx# feed vertical (FlatList paginado)
  src/components/VersusCard.tsx# tarjeta 1vs1 (2 vídeos + votación)
  src/components/VideoSide.tsx # REPRODUCTOR (expo-video). <-- aquí se enchufa el tuyo
```

## Enchufar TU reproductor
Cuando subas tu reproductor, sustituye **solo** `src/components/VideoSide.tsx`
manteniendo sus props (`uri`, `isActive`, `muted`). Todo lo demás (feed, votación,
precarga) seguirá funcionando igual.

## Notas de rendimiento (precarga tipo TikTok)
- Se monta el reproductor de la tarjeta ACTIVA y de la SIGUIENTE → arranque
  instantáneo al deslizar; las demás muestran solo el póster (0 decoders).
- `FlatList` con `pagingEnabled`, `getItemLayout` y `windowSize` reducido para
  no agotar memoria/decoders en gama baja.
