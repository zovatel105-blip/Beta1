# Copia de seguridad de /app/.env (NO gitignored — este archivo SÍ persiste)

CAUSA RAÍZ (confirmada por troubleshoot_agent): el archivo /app/.env está en
.gitignore por seguridad, y la base de datos MongoDB vive en almacenamiento
EFÍMERO (/var/lib/mongodb, fuera del volumen persistente de /app). Cuando el
pod/contenedor se recrea, `/app` se repuebla desde git (que NO incluye
.env por ser gitignored) y MongoDB queda completamente vacío. Por eso
".env se pierde" y la base de datos aparece vacía repetidamente.

FIX permanente: cada vez que .env falte, restaurar exactamente este contenido
en /app/.env y volver a sembrar los usuarios de prueba (ver
scripts/seed-core-users.mjs y memory/test_credentials.md).

## Contenido de referencia de /app/.env

```
MONGO_URL=mongodb://localhost:27017/twyk
ADMIN_EMAILS=twyk.apk@gmail.com
NEXT_PUBLIC_BASE_URL=https://vote-opacity-toggle.preview.emergentagent.com
CORS_ORIGINS=https://vote-opacity-toggle.preview.emergentagent.com
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

NOTA (push notifications, ver lib/push.js): las 3 variables FIREBASE_* son
necesarias para que el backend pueda ENVIAR notificaciones push (Firebase
Cloud Messaging). YA ESTÁN CONFIGURADAS con credenciales reales (proyecto
Firebase "twyk-6d691", cuenta de servicio
firebase-adminsdk-fbsvc@twyk-6d691.iam.gserviceaccount.com) subidas por el
usuario en esta sesión. Por seguridad, la PRIVATE_KEY real NO se guarda en
este archivo (que sí persiste en git) — si tras un reinicio de pod
`/app/.env` vuelve a faltar y las notificaciones push dejan de funcionar
(sendPush queda en modo no-op silencioso, el resto de la app sigue
funcionando), hay 2 formas de recuperarla:
  1) Pedir al usuario que vuelva a subir el archivo JSON del "Admin SDK"
     (Firebase Console -> Configuración del proyecto -> Cuentas de
     servicio -> Generar nueva clave privada -> descarga un JSON nuevo;
     puede generar tantas como quiera, las viejas siguen siendo válidas
     también salvo que las revoque) y volver a extraer sus 3 campos
     (project_id, client_email, private_key) hacia FIREBASE_PROJECT_ID/
     FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.
  2) El archivo Android `android-twyk/app/google-services.json` (NO es
     secreto, es configuración de cliente) SÍ persiste en git — de ahí se
     puede confirmar el `project_id` (`twyk-6d691`) para no perder la
     referencia de qué proyecto de Firebase usar.

NOTA: si la URL de preview cambia (nuevo dominio *.preview.emergentagent.com),
actualizar NEXT_PUBLIC_BASE_URL y CORS_ORIGINS. PRECAUCIÓN (descubierto en esta
sesión): la variable APP_URL de /etc/supervisor/conf.d/*.conf puede estar
DESACTUALIZADA/no ser la URL pública real — en esta sesión APP_URL decía
"...39916023-119b-4dfc-a049-dc702e1d7e1f..." pero la URL REAL (confirmada por
Next.js sincronizando `.env` solo, y porque coincide con el nombre del job de
los artefactos subidos por el usuario, "job_native-app-repair") era
"native-app-repair.preview.emergentagent.com". Si tras copiar el valor de
APP_URL las cosas no funcionan (CORS, imágenes/push con URL absoluta rota),
verificar el valor REAL revisando a qué dominio responde `NEXT_PUBLIC_BASE_URL`
después de que Next.js haga su propio "Reload env: .env" (log de supervisor),
o preguntar al usuario cuál es la URL que ve en su navegador.

## Última URL usada (actualizada automáticamente al restaurar)
NEXT_PUBLIC_BASE_URL=https://04f788d8-02d8-4934-9db4-85938ad26e4b.preview.emergentagent.com
(.env recreado en esta sesión — FIREBASE_* vacíos otra vez, EMERGENT_LLM_KEY
renovada vía emergent_integrations_manager: sk-emergent-3B087C871C1C86fE8A)

## ⚠️ ESTADO ACTUAL (esta sesión): FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY RESTAURADOS
El usuario volvió a subir el JSON de la cuenta de servicio de Firebase
(twyk-6d691-firebase-adminsdk-fbsvc-...json) — FIREBASE_CLIENT_EMAIL y
FIREBASE_PRIVATE_KEY ya están en /app/.env (extraídos con un script node desde
el JSON descargado, sin retipear manualmente, para no corromper los saltos de
línea "\n" literales que exige lib/push.js). VERIFICADO con una llamada real
a messaging.send() con un token FCM inventado: Google respondió
'messaging/invalid-argument: The registration token is not a valid FCM
registration token' (NO un error de autenticación) — confirma que las
credenciales son válidas y la app puede autenticarse contra Firebase
correctamente. Las notificaciones push YA deberían llegar a dispositivos
Android reales con un token FCM real registrado (requiere que el usuario
tenga la APK instalada con Config.kt apuntando a esta URL). Si /app/.env
vuelve a perderse, estas 2 variables se pierden con él (son secretas, nunca
se respaldan en texto plano en este archivo) — pedir al usuario que vuelva a
subir el mismo JSON si eso ocurre.

## EMERGENT_LLM_KEY (feature IA de edición de imágenes en la creación de contenido)
También añadida a /app/.env: EMERGENT_LLM_KEY=sk-emergent-43fBb4a6a83A957D72
(clave RENOVADA en esta sesión — la anterior sk-emergent-1183407D7D1FdD3D62
agotó su presupuesto; si vuelve a agotarse, usar emergent_integrations_manager
para obtener la vigente)
(obtenida vía emergent_integrations_manager). Si /app/.env vuelve a
desaparecer, esta clave también debe restaurarse o el editor de imágenes con
IA (POST /api/ai/edit-image) dejará de funcionar (no falla la app entera,
solo esa función).

## IMPORTANTE: también actualizar la app nativa Android
Cuando la URL de preview cambia, además de /app/.env también hay que
actualizar `Config.BASE_URL` en
/app/android-twyk/app/src/main/java/com/twyk/app/Config.kt (hardcodeada por
separado para el build de Android, NO lee /app/.env) — si no se actualiza
ahí también, la app nativa compilada sigue apuntando a un backend viejo/caído
(síntoma real observado: contadores sociales en 0 hasta interactuar
localmente, feed vacío, login fallando, etc., aunque el backend "nuevo" esté
sano).

## NOTA sobre ffmpeg (persistencia)
ffmpeg también se pierde tras cada reinicio de pod (paquete apt en filesystem
raíz efímero). Ya existe un script 'predev' en package.json que lo reinstala
automáticamente en cada 'yarn dev', pero si el arranque falla o tarda, puede
reinstalarse manualmente con: apt-get update -qq && apt-get install -y -qq ffmpeg

## Re-sembrar datos tras restaurar .env

```bash
sudo supervisorctl restart nextjs
node /app/scripts/seed-core-users.mjs
```

Esto crea (si no existen ya) twykadmin (admin), lucia, marcos y laura con las
credenciales documentadas en memory/test_credentials.md, y las relaciones de
"follow" básicas entre ellos.
