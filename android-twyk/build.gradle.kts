// Plugins del proyecto raiz. Si Android Studio sugiere otras versiones al abrir,
// acepta sus sugerencias (usa las que coincidan con tu Android Studio instalado).
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    // Notificaciones push (Firebase Cloud Messaging) — requiere el archivo
    // `google-services.json` en `android-twyk/app/` (descargado desde la
    // consola de Firebase, ver memory/PRD.md para instrucciones completas).
    // SIN ese archivo, la sincronización de Gradle FALLARÁ.
    id("com.google.gms.google-services") version "4.4.2" apply false
}
