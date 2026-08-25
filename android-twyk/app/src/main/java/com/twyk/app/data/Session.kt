package com.twyk.app.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.gson.Gson

// Sesión con persistencia (SharedPreferences) + estado observable de Compose.
// - El token Bearer y el usuario se guardan en disco -> sobreviven al cerrar la app.
// - token/user son estado de Compose -> al hacer login/registro/logout las
//   pantallas que dependen de la sesión se recomponen automáticamente.
// El interceptor de OkHttp (TwykApi) lee Session.token en cada petición.
object Session {
    var token by mutableStateOf<String?>(null)
        private set

    var user by mutableStateOf<User?>(null)
        private set

    val isLoggedIn: Boolean get() = token != null

    private var prefs: android.content.SharedPreferences? = null
    private val gson = Gson()

    // Llamar una vez al arrancar (MainActivity.onCreate) para restaurar la sesión.
    fun init(context: Context) {
        val p = context.applicationContext.getSharedPreferences("twyk_session", Context.MODE_PRIVATE)
        prefs = p
        token = p.getString("token", null)
        user = p.getString("user", null)?.let { runCatching { gson.fromJson(it, User::class.java) }.getOrNull() }
    }

    // Guarda (o limpia) la sesión en memoria y en disco.
    fun set(newToken: String?, newUser: User?) {
        token = newToken
        user = newUser
        prefs?.edit()?.apply {
            if (newToken != null) putString("token", newToken) else remove("token")
            if (newUser != null) putString("user", gson.toJson(newUser)) else remove("user")
            apply()
        }
    }

    fun clear() = set(null, null)
}
