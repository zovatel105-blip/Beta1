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
NEXT_PUBLIC_BASE_URL=https://challenge-card-ai.preview.emergentagent.com
CORS_ORIGINS=https://challenge-card-ai.preview.emergentagent.com
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

## STRIPE — CARTERA (Wallet de créditos, moneda virtual NUEVA — sesión
## "770f54fd", petición del usuario "cartera con creditos en el menu de los
## ajustes del perfil"). Pago ÚNICO (mode:'payment'), separado por completo
## de los planes de suscripción del editor de IA (AI_PLANS/STRIPE_PRICE_
## STARTER|PRO|PREMIUM, ver sección STRIPE más abajo en este archivo).
STRIPE_PRICE_WALLET_SMALL=price_1UA8SwJN5FEXBU03MxQRPkhe   (150 credits, $0.99)
STRIPE_PRICE_WALLET_MEDIUM=price_1UA8SwJN5FEXBU03GWMYwOlm  (800 credits, $4.99)
STRIPE_PRICE_WALLET_LARGE=price_1UA8SwJN5FEXBU03F2VJabUJ   (2000 credits, $9.99)
STRIPE_PRICE_WALLET_MEGA=price_1UA8SwJN5FEXBU03njH9NJGn    (5000 credits, $19.99)
Creados con scripts/stripe-wallet-setup.mjs (re-ejecutable sin duplicar si
estas variables se pierden — vuelve a crear 4 precios NUEVOS en Stripe, no
reutiliza los de arriba; solo hace falta si de verdad no quedó ningún
registro de estos 4 IDs). Si `.env` se pierde pero estos 4 IDs siguen aquí,
NO hace falta re-ejecutar el script — solo pegarlos de vuelta.

STRIPE_WEBHOOK_SECRET (de ESTA sesión, distinto del de la sección STRIPE
más abajo si la URL de preview cambió — un webhook nuevo por URL nueva):
STRIPE_WEBHOOK_SECRET=whsec_VmvkIhVhztxmJvD11bw6MobwY5HLA6az
Apunta a `we_1UA8THJN5FEXBU03YIu9TYZs` -> `<NEXT_PUBLIC_BASE_URL de esta
sesión>/api/stripe/webhook`, mismos `enabled_events` que el webhook de IA
(un único endpoint de Stripe recibe TODO: suscripciones de IA Y compras de
la Cartera — handleStripeWebhook/route.js distingue por
`metadata.type==='wallet_topup'` vs el resto). Si la URL de preview cambia,
hay que crear un webhook NUEVO (ver snippet en la sección STRIPE de abajo)
y actualizar este secret.

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
NEXT_PUBLIC_BASE_URL=https://439a7632-7297-4f25-a23c-33d2e7b45979.preview.emergentagent.com
(.env RECREADO en esta nueva sesión — mismo patrón recurrente de siempre: /app había perdido
TODO salvo .git [restaurado con `git reset --hard origin/main`, ya que `refs/heads/master` local
no tenía commits pero `refs/heads/main`/`origin/main` sí]. `.env` no existía [gitignored].
`node_modules` también estaba vacío -> `yarn install` ejecutado. Recreado con MONGO_URL/
ADMIN_EMAILS/CORS_ORIGINS apuntando a la URL de arriba [tomada de APP_URL en
/etc/supervisor/conf.d/supervisord.conf]. EMERGENT_LLM_KEY renovada vía
emergent_integrations_manager: sk-emergent-bEdD4C6CfF07221200. TAVILY_API_KEY restaurada igual
que antes. FIREBASE_*, AGNES_API_KEY y STRIPE_* quedaron VACÍOS otra vez (secretos que no
persisten fuera de sesión) — pedir al usuario si los necesita de nuevo. Base de datos re-sembrada
con `node scripts/seed-core-users.mjs`. `memory/test_credentials.md` recreado. Verificado con
login real (POST /api/auth/login, twyk/Admin12345) -> 200 OK y GET /api/feed -> 200 OK. A
petición explícita del usuario, NO se invocó el agente de testing en esta ronda.

## Sesión anterior
NEXT_PUBLIC_BASE_URL=https://challenge-card-ai.preview.emergentagent.com
(.env RECREADO otra vez en esta nueva sesión — mismo patrón recurrente: /app
había perdido TODO salvo .git [`git reset --hard origin/main` restauró el
working tree]. .env no existía [gitignored, como siempre]. Recreado con
MONGO_URL/ADMIN_EMAILS/CORS_ORIGINS apuntando a la URL de arriba [tomada de
APP_URL en /etc/supervisor/conf.d/*.conf]. EMERGENT_LLM_KEY renovada vía
emergent_integrations_manager: sk-emergent-60549C8C65bD3036dE. TAVILY_API_KEY
restaurada igual que antes. FIREBASE_*, AGNES_API_KEY y STRIPE_* quedaron
VACÍOS otra vez (secretos que no persisten). Base de datos re-sembrada con
node scripts/seed-core-users.mjs. memory/test_credentials.md recreado.
Verificado con login real (POST /api/auth/login, twyk/Admin12345) -> 200 OK.

## Sesión anterior
NEXT_PUBLIC_BASE_URL=https://challenge-card-ai.preview.emergentagent.com
(.env RECREADO en esta nueva sesión — esta vez la pérdida fue TOTAL: todo
`/app` había vuelto al último commit de git vía `git reset --hard HEAD`
[el working tree estaba vacío salvo `.git`, con TODOS los archivos
aparecían "staged for deletion" — se restauraron con éxito]. .env no existía
[era gitignored, como siempre]. Recreado con MONGO_URL/ADMIN_EMAILS/
CORS_ORIGINS apuntando a la URL de arriba [tomada de APP_URL en
/etc/supervisor/conf.d/*.conf, confirmada con "Reload env: .env" + login
real 200 (twyk/Admin12345)]. EMERGENT_LLM_KEY renovada vía
emergent_integrations_manager: sk-emergent-2AcAaC781Ae5f265c6. TAVILY_API_KEY
restaurada igual que antes (valor conocido, no secreto perdido). FIREBASE_*,
AGNES_API_KEY y STRIPE_* quedaron VACÍOS — son secretos que no persisten en
ningún lado fuera de la sesión donde el usuario los compartió, así que hay
que pedírselos de nuevo si los necesita. Base de datos re-sembrada con
node scripts/seed-core-users.mjs (twyk/lucia/marcos/laura + follows básicos).
memory/test_credentials.md recreado.

## Sesión anterior
NEXT_PUBLIC_BASE_URL=https://challenge-card-ai.preview.emergentagent.com
(.env RECREADO otra vez en esta nueva sesión — mismo patrón recurrente: /app/.env
no existía [MONGO_URL undefined, login daba 500], se recreó con MONGO_URL/
ADMIN_EMAILS/CORS_ORIGINS apuntando a la URL de arriba [tomada de APP_URL en
/etc/supervisor/conf.d/*.conf, confirmada correcta tras "Reload env: .env" y
login real 200]. FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY quedaron vacíos
[el usuario debe volver a subir el JSON de la cuenta de servicio si necesita
push]. EMERGENT_LLM_KEY renovada vía emergent_integrations_manager:
sk-emergent-995A47159038fB20d9. TAVILY_API_KEY restaurada igual que antes.
Base de datos re-sembrada con node scripts/seed-core-users.mjs (twyk/lucia/
marcos/laura + follows) y scripts/seed-test-open-challenge.mjs (post single
de lucia, para verificar visualmente el nuevo botón de corazón ❤️ — antes
🔥 Fire — en OpenChallengeSlide.jsx). memory/test_credentials.md recreado.

## Sesión anterior (URL heart-reaction-swap.preview.emergentagent.com)
NEXT_PUBLIC_BASE_URL=https://challenge-card-ai.preview.emergentagent.com
(.env RECREADO en esta nueva sesión, tras un reinicio de pod que dejó /app/.env
inexistente y MongoDB vacía — misma causa raíz recurrente de siempre.
MONGO_URL/ADMIN_EMAILS/CORS_ORIGINS con esta misma URL nueva; FIREBASE_* vacíos
[el usuario debe volver a subir el JSON de la cuenta de servicio de Firebase si
necesita push]; EMERGENT_LLM_KEY renovada vía emergent_integrations_manager:
sk-emergent-16fE8EcCf0a1d80C6A; TAVILY_API_KEY restaurada igual que antes. Base
de datos re-sembrada con node scripts/seed-core-users.mjs (usuarios twyk/lucia/
marcos/laura + follows básicos); memory/test_credentials.md recreado.
Verificado con llamada real (node fetch, sin curl): POST /api/auth/login
(twyk) -> 200. Config.kt (Android) NO se tocó en esta sesión — revisar si
sigue apuntando a esta misma URL antes de recompilar el APK.

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

## TAVILY_API_KEY (búsqueda web en tiempo real para fundamentar el Trending
## Challenge en tendencias REALES de TikTok/Instagram, no solo el conocimiento
## entrenado de la IA — petición explícita del usuario, key proporcionada
## directamente por él, NO vía emergent_integrations_manager)
TAVILY_API_KEY=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
Usada por searchViralTrendEvidence() en route.js (generateRegionalThemeWithAI,
handleAutoGenerateLuxuryTheme, handleGenerateLuxuryThemeIdeas) — busca en la
web real "qué reto/tendencia de TikTok/Instagram es viral ahora mismo [en
<país>]" y esa evidencia real (con URLs/fecha) se pasa a Claude como contexto
para que el tema generado se base en un reto REAL y verificable, no
inventado. Si esta key falta o Tavily falla, el código cae de vuelta
silenciosamente al comportamiento anterior (Claude usando solo su propio
conocimiento) — nunca rompe la función, solo pierde el "grounding" en tiempo
real. Si /app/.env vuelve a desaparecer, pedir al usuario la misma key de
nuevo (o que genere una nueva gratis en tavily.com) si esta restauración por
memoria no es suficiente.

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

## AGNES_API_KEY (editor de fotos con IA — motor GRATIS/ilimitado)
`platform.agnes-ai.com` (modelo `agnes-image-2.1-flash`, ver
generateAgnesImage/route.js). Si `/app/.env` vuelve a perderse, el editor
falla con "AGNES_API_KEY missing" en los logs — pedir al usuario esta key de
nuevo (la tiene guardada, ya la ha compartido varias veces en distintas
sesiones). NUNCA usar la Universal Key de Emergent para Agnes — es una
plataforma de terceros totalmente distinta.
RESTAURADA de nuevo en esta sesión: sk-EuMIognaqzJHkqzPuoGt9pYTztegnTWu29Dgz9Tp45nWdIZ0
(verificada con una edición real end-to-end vía POST /api/ai/edit-image,
engine=agnes -> 200 OK, provider=agnes. Nota de esta sesión: un 1x1 px de
prueba hace que Agnes devuelva 500 "internal error" -no es un problema de la
key-, hay que probar siempre con una foto real de tamaño normal).

## STRIPE (suscripción de pago para el editor con GEMINI — Agnes sigue gratis)
Petición del usuario: "Gemini... pero los usuarios tendran que pagar...
como larpgpt... Agnes gratuita, Gemini pago". 3 planes mensuales (ver
AI_PLANS en lib/stripe.js): Starter €5/5 ediciones, Pro €10/20 ediciones,
Unlimited €20/ilimitado. Variables en `.env`: STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER/PRO/UNLIMITED. Los planes+precios
YA existen en la cuenta de Stripe del usuario (creados con
`scripts/stripe-setup.mjs`, no hace falta re-crearlos si `.env` se pierde —
solo hay que volver a pedir la STRIPE_SECRET_KEY y regenerar el webhook
apuntando a la URL actual, ver siguiente sección). Créditos por usuario
guardados en el propio documento de `users` (aiPlan/aiSubscriptionStatus/
aiCreditsRemaining/aiMonthlyQuota/aiCurrentPeriodEnd/aiSubscriptionId/
stripeCustomerId) — NUNCA se otorgan créditos salvo en un webhook
`invoice.paid` real (ver grantMonthlyAiCredits/lib/db.js).

RESTAURADA de nuevo en esta sesión (STRIPE_SECRET_KEY sk_test_51U93y6...,
compartida de nuevo por el usuario). IMPORTANTE — descubierto en esta sesión:
la cuenta de Stripe tiene DOS sets de precios "Twyk AI Editor" (uno viejo sin
conteo de créditos en el nombre -Starter/Pro/Unlimited, 500/1000/2000 centavos,
coincide con AI_PLANS actual del código- y otro más nuevo con conteo en el
nombre -"Starter (50 credits/mo)"/"Pro (120 credits/mo)"/"Premium (300
credits/mo)"-, de una sesión anterior que subió los créditos pero cuyo cambio
correspondiente en lib/stripe.js no está en este checkout de git). Se usó el
set que SÍ coincide con el código actual (5/20/ilimitado créditos):
STRIPE_PRICE_STARTER=price_1U94E4JN5FEXBU033nFHPYip
STRIPE_PRICE_PRO=price_1U94E4JN5FEXBU03c4Kq8wim
STRIPE_PRICE_UNLIMITED=price_1U94E4JN5FEXBU030WoePOIs
Si el usuario esperaba los créditos más altos (50/120/300), avisarle de este
desajuste histórico antes de asumir cuál usar. Webhook NUEVO creado apuntando
a la URL actual (we_1U9f9GJN5FEXBU03b8ifHU3k,
STRIPE_WEBHOOK_SECRET=whsec_bJFIlmITiHbDVaJCiQb6ZNqNJJx1HdgR) — los 2
webhooks viejos (URLs de sesiones anteriores, ya caídas) se dejaron intactos
en el dashboard de Stripe, no afectan nada al no recibir tráfico real.
Verificado end-to-end real: (1) POST /api/ai/edit-image engine=gemini SIN
suscripción -> 402 subscription_required (paywall correcto); (2) POST
/api/stripe/checkout plan=starter -> 200 con una URL real de Stripe Checkout
(cs_test_...) — el usuario podría completar el pago ahí mismo con una tarjeta
de prueba de Stripe para verificar el webhook/otorgamiento de créditos, no
probado en esta sesión (requeriría completar un pago real, aunque sea de
prueba).

NOTA IMPORTANTE (bug real encontrado y corregido en una sesión anterior): la cuenta
de Stripe del usuario usa una versión de API donde `subscription.
current_period_end` y `invoice.lines.data[0].price` YA NO EXISTEN en esas
rutas — se movieron a `subscription.items.data[0].current_period_end` y
`invoice.lines.data[0].pricing.price_details.price` respectivamente. El
webhook (handleStripeWebhook/route.js) ya prueba AMBAS rutas (fallback), no
tocar esa lógica sin volver a verificar con una suscripción de prueba real
(ver también la guarda de eventos fuera de orden en
applyAiSubscriptionStatus/lib/db.js — un `subscription.deleted` de una
suscripción VIEJA ya reemplazada por otra nueva no debe pisar el estado
activo actual).

Si el webhook deja de recibir eventos tras un cambio de URL de preview,
recrearlo con la URL nueva (la key secreta NO cambia, solo hace falta un
webhook nuevo + su whsec_ nuevo):
```js
const stripe = new (require('stripe'))(process.env.STRIPE_SECRET_KEY)
await stripe.webhookEndpoints.create({
  url: `${NEXT_PUBLIC_BASE_URL}/api/stripe/webhook`,
  enabled_events: ['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'],
})
```

## ⚠️ BUG PROPIO CORREGIDO EN ESTA SESIÓN: NEXT_PUBLIC_BASE_URL desincronizado
Antes de esta corrección, `/app/.env` tenía `NEXT_PUBLIC_BASE_URL` apuntando
a una URL de preview VIEJA (`heart-reaction-swap...`) mientras
`CORS_ORIGINS` y el `APP_URL` real de supervisor ya apuntaban a la URL
ACTUAL (`3743efab-7ae3-4276-8da1-a72779cb59e6...`) — causado por copiar mal
la referencia histórica de este mismo archivo al recrear `.env` tras una
pérdida. Esto rompía silenciosamente cualquier URL absoluta generada con
`NEXT_PUBLIC_BASE_URL` (imágenes de push notifications vía toAbsoluteUrl en
lib/push.js, Y el webhook de Stripe recién creado apuntaba a un dominio
equivocado). Corregido: ambas variables ahora coinciden. **Si en el futuro
`.env` se vuelve a recrear a mano, verificar SIEMPRE que
`NEXT_PUBLIC_BASE_URL` y `CORS_ORIGINS` sean EXACTAMENTE la misma URL** (la
real, tomada de `APP_URL` en `/etc/supervisor/conf.d/*.conf`), nunca copiar
una URL de una sesión anterior sin comparar contra la actual.
