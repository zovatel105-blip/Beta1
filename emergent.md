# Twyk — Registro de cambios (Traducción ES → EN)

Fecha: Julio 2025
Objetivo: Dejar **toda la aplicación en inglés** (UI, mensajes de backend, páginas
legales, panel de admin y datos demo). Se completaron las cadenas que quedaban en
español tras la traducción previa.

---

## 1. Fix crítico de infraestructura (bloqueante)

- **`/app/.env` faltaba** (estaba en `.gitignore`, nunca commiteado y sin variables
  en el entorno), por lo que **todo el backend devolvía HTTP 500** (`MONGO_URL`
  indefinido). Se recreó:
  - `MONGO_URL=mongodb://localhost:27017/twyk` (nombre de DB `twyk`, tomado de
    `seed-posts.mjs`)
  - `NEXT_PUBLIC_BASE_URL=` (URL de preview del entorno)
- `lib/mongodb.js`: mensaje de error `'Por favor define MONGO_URL en .env'` →
  `'Please define MONGO_URL in .env'`.
- Tras recrear `.env` y reiniciar `nextjs`, los endpoints `/api/feed`, `/api/users`,
  `/api/auth/*`, etc. responden **200**.

---

## 2. Frontend — Componentes traducidos

- **AuthModal.jsx**: pasos de registro (fecha/correo/contraseña/usuario), validaciones,
  bloqueo COPPA, splash login/registro, footers legales, placeholders, botones
  (Log in / Sign up / Create account / Continue). Apóstrofes escapados con `&apos;`.
- **ProfilePage.jsx**: perfil de invitado, estados vacíos (posts/guardados), pestañas,
  stats (Votes/Challenges), botones (Edit profile/Share/Follow/Following/Challenge),
  drawers (Menu/Settings/Moderation panel/Log out), enlaces legales, lista de
  followers/following, modal de editar perfil (Name/Bio/Change photo/Save) y mensajes
  de error.
- **CompletedBattlesPage.jsx** (reescrito): estado vacío, sugerencias, control
  segmentado (Completed/Active), share, aria-labels.
- **ActiveChallengesPage.jsx** (reescrito): subir/cambiar vídeo de respuesta, hints,
  Accept challenge / Upload & accept / Reject, estado vacío.
- **NotificationsInbox.jsx**: filtros, encabezado, "Mark as read", estados vacíos.
- **ChallengesInbox.jsx**: "challenged you", subir/cambiar vídeo, Cancel/Accept,
  "Challenges received", estado vacío.
- **OptionsModal.jsx**: `REPORT_REASONS` en inglés, mensajes de reporte/bloqueo,
  filas (Not interested/Report/Block user/Copy link), "Report post".
- **UploadDialog.jsx** y **ChallengeDialog.jsx**: errores, headers, modos
  (Versus/1vs1/Challenges), placeholders y botones.
- **CommentsModal.jsx**: "No comments yet", placeholder, "Log in to comment",
  tiempo ("Now"), aria-labels.
- **ShareModal.jsx**: "Share", "Send to", "Copy link"/"Copied", aria-label.
- **DuetSlide.jsx / CarouselSlide.jsx**: aria-labels (follow/votes/challenge/close).
- **Feed.jsx**: banner de reto ("Challenge sent to…", "Couldn't send the challenge",
  "Try again").

## 3. Páginas legales (reescritas en inglés)

- **app/terms/page.js** → Terms of Use
- **app/privacy/page.js** → Privacy Policy
- **app/dmca/page.js** → DMCA Policy (formulario y plantilla de email)
- `lang`/títulos ya en inglés.

## 4. Panel de administración

- **app/admin/reports/page.js** (reescrito): UI en inglés y claves de `REASON_COLORS`
  alineadas con los motivos de reporte en inglés.

## 5. Backend (`app/api/[[...path]]/route.js`)

- Mensajes de error de auth/upload: "You must log in", "…to publish", "…to challenge",
  "Invalid date of birth", "Date of birth is required", "Twyk isn't available for users
  under 13", "This email is already registered", "Wrong username or password".
- Descripciones por defecto de publicaciones, etiquetas `Option A/B`, `name: 'You'`,
  `'Anonymous User'`, reto por defecto ("My challenge"/"Challenge").
- Datos demo del feed (`VIDEOS`): descripciones y títulos de música traducidos
  (nombres propios de autores se conservan).

## 6. Librerías

- **lib/db.js**: textos de notificaciones (`getNotificationText`), tiempos relativos
  (`now`, `Xm ago`, `Xh ago`, `yesterday`, `Xd ago`) y `REPORT_REASONS` en inglés
  (consistentes con frontend y validación de reportes).
- **lib/notifications.js**: textos mock de notificaciones traducidos.

---

## Verificación

- `nextjs` compila y sirve `/` y endpoints `/api/*` con **200**.
- ESLint sin errores en los archivos editados (solo warnings preexistentes de
  `eslint-disable` no usados).
- No quedan cadenas en español de cara al usuario (solo comentarios de código y
  nombres propios de datos demo).

### Pendiente / Notas
- Los comentarios internos del código permanecen en español (no afectan a la UI).
- No se ejecutó el agente de testing de backend/frontend en este cambio (traducción
  de texto + fix de `.env`). Recomendado validar login/registro y feed manualmente o
  con el agente de testing si se desea.


---

## 4. Recuperación de infraestructura + "propina para proponer un reto" (Sept 2026)

### Recuperación (recurrente, ver ENV_BACKUP.md)
- El pod volvió a resetearse: `/app` solo tenía `.git`, sin `node_modules`, sin
  `/app/.env`, y `supervisord.conf` (READONLY, plantilla FastAPI+React) apuntaba a
  `/app/backend` y `/app/frontend`, que no existen en este repo (es un monolito
  Next.js en `/app`).
- Se restauró: `git` ya tenía todo el código (solo faltaba en disco por el reset).
  Se recreó `/app/.env` (`MONGO_URL`, `NEXT_PUBLIC_BASE_URL`, `EMERGENT_LLM_KEY`),
  se corrió `yarn install`, y se creó `/etc/supervisor/conf.d/nextjs.conf` (programa
  `nextjs`, `yarn dev` en `/app`, puerto 3000, `NODE_OPTIONS=--max-old-space-size=4096`
  — 512MB causaba reinicios frecuentes por el watchdog de memoria de Next 14).
- **Hallazgo clave**: el ingress de Kubernetes de este entorno enruta `/api/*`
  SIEMPRE al puerto 8001 (backend), sin importar el tipo de imagen
  (`nextjs_mongo_shadcn`). Como la app real sirve `/api/*` desde Next.js en el
  puerto 3000, se creó `/app/backend/server.py`: un proxy inverso FastAPI minimal
  que reenvía TODO `/api/*` de 8001 → `http://127.0.0.1:3000`, con 3 reintentos
  cortos ante `ConnectError`/`RemoteProtocolError` (absorbe la ventana de reinicio
  del watchdog de memoria de `nextjs`). **Este archivo debe recrearse igual en el
  próximo reset** si `/app/backend/server.py` volviera a desaparecer.
- Se corrió `node scripts/seed-core-users.mjs` (usuarios `twyk`/`lucia`/`marcos`/
  `laura`, ver `/app/memory/test_credentials.md` — login es `{"username","password"}`,
  NO `identifier`).

### Nueva feature: propina para proponer un reto (perfil ajeno)
Petición del usuario: "en el perfil ajeno se puede enviar una propina pero esa
propina debe enviarse para proponer un challenge". Aclarado vía `ask_human`:
- Los botones "Challenge" (espadas, reto directo) y "Tip" (propina) del perfil
  ajeno **se mantienen separados**.
- El botón de Tip (`TipSheet.jsx`) ya NO es un regalo suelto: crea una PROPUESTA
  de reto con los créditos en ESCROW (`POST /api/tip-challenges`, colección Mongo
  `tipChallenges`, ver `lib/stores.js`).
- Ciclo: `pending` → (destinatario) **Aceptar** (sube vídeo/foto, multipart) →
  `submitted` → (emisor original) **Aprobar** → `approved` (créditos liberados al
  destinatario) | **Rechazar entrega** → `declined` (reembolso al emisor). O
  `pending` → (destinatario) **Rechazar** → `rejected` (reembolso inmediato).
- Endpoints nuevos en `route.js`: `GET/POST /api/tip-challenges`,
  `POST /api/tip-challenges/:id/{accept,reject,approve,decline}`.
- `NotificationsInbox.jsx`: tarjetas accionables para `tip_challenge_proposal`
  (Aceptar/Rechazar) y `tip_challenge_submitted` (Aprobar/Rechazar, con preview de
  la entrega) — el estado en vivo se carga aparte vía `GET /api/tip-challenges?role=`
  porque la notificación en sí es inmutable.
- Verificado end-to-end con un script Node ad-hoc (login real, escrow, accept con
  archivo real, approve/decline/reject, dobles-clic bloqueados, self-challenge y
  saldo insuficiente rechazados) — **no se usó el agente de testing en este cambio**
  (petición explícita del usuario). Datos de prueba limpiados de Mongo al terminar.

### Pendiente / Notas
- No se verificó visualmente por Playwright (la app es "mobile-only" — el
  screenshot tool de este entorno no logró simular UA+viewport móvil de forma
  fiable en esta sesión). Recomendado que el usuario pruebe manualmente el flujo
  completo desde un perfil ajeno.
