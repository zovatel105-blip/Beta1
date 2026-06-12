package com.twyk.app.data

// Sesión en memoria: guarda el token Bearer y el usuario tras login/registro.
// El interceptor de OkHttp (TwykApi) añade "Authorization: Bearer <token>" a cada
// petición cuando hay sesión. (Persistencia entre reinicios -> fase posterior.)
object Session {
    @Volatile
    var token: String? = null

    @Volatile
    var user: User? = null

    val isLoggedIn: Boolean get() = token != null
}
