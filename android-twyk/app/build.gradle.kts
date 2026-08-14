plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    // Notificaciones push (Firebase Cloud Messaging) — requiere el archivo
    // `google-services.json` en esta misma carpeta (`android-twyk/app/`),
    // descargado desde la consola de Firebase. SIN ese archivo, la
    // sincronización de Gradle FALLARÁ con "File google-services.json is
    // missing". Ver memory/PRD.md para instrucciones completas.
    id("com.google.gms.google-services")
}

android {
    namespace = "com.twyk.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.twyk.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    // Compose (BOM alinea todas las versiones de Compose).
    val composeBom = platform("androidx.compose:compose-bom:2026.04.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Media3 / ExoPlayer (reproductor nativo) + cache en disco.
    val media3 = "1.5.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-ui:$media3")
    implementation("androidx.media3:media3-datasource:$media3")

    // Red (consume el backend Next.js existente).
    implementation("com.squareup.okhttp3:okhttp:4.12.0") // extensiones Kotlin (asRequestBody, toMediaTypeOrNull…)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")

    // Posters / imagenes.
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Desenfoque de fondo tipo "vidrio esmerilado" (réplica exacta de
    // `backdrop-blur-sm` de la web, CSS puro, en la píldora de contador de
    // votos del grid del perfil — ui/Profile.kt, ProfileGridItem). Usa
    // RenderEffect real en Android 12L+ (API 32+); en versiones más
    // antiguas (nuestro minSdk 24) cae automáticamente a un "fallback tint"
    // (el mismo negro semi-transparente de siempre, SIN blur) — degradación
    // segura y ya visualmente idéntica al comportamiento anterior a este
    // cambio, cero riesgo en dispositivos viejos.
    implementation("dev.chrisbanes.haze:haze:1.7.1")

    // Cola de subidas en segundo plano (sobrevive a cerrar la pantalla de
    // subir e incluso a que el sistema recree el proceso) — ver
    // data/UploadWorker.kt.
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // Notificaciones push (Firebase Cloud Messaging) — ver
    // data/PushTokenManager.kt, push/TwykFirebaseMessagingService.kt y el
    // backend (lib/push.js). El BoM alinea la versión de firebase-messaging
    // automáticamente (no fijar su versión por separado).
    implementation(platform("com.google.firebase:firebase-bom:33.10.0"))
    implementation("com.google.firebase:firebase-messaging")

    // BUG reportado por el usuario ("hay 2 splash screen, eliminar el
    // primero y dejar el segundo"): Android 12+ (API 31+) SIEMPRE pinta su
    // PROPIA pantalla de splash del sistema al arrancar en frío (icono de la
    // app sobre el color de fondo del tema) — es un comportamiento del
    // SISTEMA OPERATIVO, no algo que la app decida por sí sola, y ANTES esta
    // app no tenía ningún control sobre ella: se veía brevemente ese splash
    // del sistema y, justo después, el splash PROPIO de la app
    // (SplashScreen() en MainActivity.kt: logo grande sobre fondo blanco,
    // 1.1s) — 2 pantallas de marca distintas y visualmente descoordinadas
    // en fila. La librería de compatibilidad `core-splashscreen` es la única
    // forma soportada de tomar control de ESE splash del sistema (funciona
    // igual en versiones antiguas de Android, donde el sistema no lo pinta
    // por sí solo) — ver Theme.Twyk.Starting (themes.xml) +
    // installSplashScreen() en MainActivity.kt.
    implementation("androidx.core:core-splashscreen:1.0.1")
}
