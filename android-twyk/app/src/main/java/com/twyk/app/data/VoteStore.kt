package com.twyk.app.data

import android.content.Context

// Recuerda tu voto por publicación ENTRE SESIONES — réplica exacta de
// `localStorage.setItem('versus_vote_'+id, side)` / `'duet_vote_'+id` que usan
// CarouselSlide.jsx/DuetSlide.jsx (leído de nuevo en un `useEffect` al montar
// la tarjeta). Antes esta app nativa NO persistía el voto en ningún sitio: el
// estado `voted` vivía solo en memoria (Compose `remember`), así que si
// reabrías la app, o si el pager reciclaba la tarjeta por alejarte mucho en
// el scroll, el voto ya emitido dejaba de mostrarse como votado (icono
// relleno, borde de color, aviso "Double-tap to switch your vote"...) aunque
// el conteo real en el backend seguía siendo correcto — un detalle de
// paridad con la web que faltaba ("el voto debe ser igual en todo a la web").
// Mismo patrón de SharedPreferences que Session.kt, en un archivo aparte para
// no acoplar el voto a la sesión de usuario.
object VoteStore {
    private var prefs: android.content.SharedPreferences? = null

    // Llamar una vez al arrancar (MainActivity.onCreate), igual que Session.init.
    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences("twyk_votes", Context.MODE_PRIVATE)
    }

    // 'a' | 'b' | null (nunca votado en esta publicación, o preferencias aún no inicializadas).
    fun get(postId: String): String? = prefs?.getString(postId, null)

    fun set(postId: String, side: String) {
        prefs?.edit()?.putString(postId, side)?.apply()
    }
}
