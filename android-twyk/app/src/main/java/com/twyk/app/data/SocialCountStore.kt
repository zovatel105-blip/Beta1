package com.twyk.app.data

import android.content.Context

// Contadores sociales por publicación persistidos ENTRE SESIONES — réplica de
// los `localStorage.setItem('savN_'+id, n)` / `'chlN_'+id` que usan
// CarouselSlide.jsx/DuetSlide.jsx en la web para que el incremento del propio
// usuario (guardar una publicación, o retarla) se MANTENGA al desplazar el
// feed o reabrir la app. Antes el feed nativo leía siempre el valor estático
// de `post.stats` y nunca reflejaba la interacción del usuario (bug reportado:
// "el botón de guardar no actualiza el número" y "el botón de retar no muestra
// el número"). Mismo patrón de SharedPreferences que VoteStore.kt/Session.kt.
object SocialCountStore {
    private var prefs: android.content.SharedPreferences? = null

    // Llamar una vez al arrancar (MainActivity.onCreate), igual que VoteStore.init.
    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences("twyk_social", Context.MODE_PRIVATE)
    }

    fun getInt(key: String): Int = prefs?.getInt(key, 0) ?: 0

    fun setInt(key: String, value: Int) {
        prefs?.edit()?.putInt(key, value)?.apply()
    }

    // Claves por publicación (mismo esquema que la web: `savN_<id>` guardados,
    // `chlN_<id>` retos).
    fun savesKey(postId: String) = "savN_$postId"
    fun challengesKey(postId: String) = "chlN_$postId"
}
