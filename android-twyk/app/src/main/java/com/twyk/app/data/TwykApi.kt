package com.twyk.app.data

import com.twyk.app.Config
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface TwykApi {
    @GET("api/uploads")
    suspend fun uploads(): UploadsResponse

    @GET("api/feed")
    suspend fun feed(@Query("cursor") cursor: Int, @Query("limit") limit: Int = 8): FeedResponse

    // Feed "Siguiendo" (nueva página, doble-click en Home del BottomNav,
    // ver MainActivity.kt/FollowingFeed.kt) — SOLO publicaciones de las
    // cuentas que el usuario sigue. Réplica exacta de GET /api/feed/following
    // (route.js) usada por hooks/useFollowingFeed.js en la web. Exige sesión:
    // sin token, el backend responde 401 (Retrofit lo lanza como
    // HttpException, capturado en FollowingFeedViewModel).
    @GET("api/feed/following")
    suspend fun feedFollowing(@Query("cursor") cursor: Int, @Query("limit") limit: Int = 8): FeedResponse

    @POST("api/vote")
    suspend fun vote(@Body body: VoteRequest): VoteResponse

    @GET("api/comments")
    suspend fun comments(@Query("postId") postId: String): CommentsResponse

    @POST("api/comments")
    suspend fun createComment(@Body body: CreateCommentRequest): CreateCommentResponse

    @POST("api/comments/like")
    suspend fun likeComment(@Body body: LikeCommentRequest): LikeResponse

    @POST("api/save")
    suspend fun save(@Body body: SaveRequest): SaveResponse

    // TWYK Engine: registra un compartido (fire-and-forget, alimenta el feed).
    @POST("api/share")
    suspend fun share(@Body body: ShareRequest): ShareResponse

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @GET("api/users/{username}")
    suspend fun userProfile(@Path("username") username: String): ProfileResponse

    @POST("api/users/{username}/follow")
    suspend fun toggleFollow(@Path("username") username: String): FollowResponse

    @Multipart
    @POST("api/profile")
    suspend fun updateProfile(
        @Part("name") name: RequestBody,
        @Part("bio") bio: RequestBody,
        @Part avatar: MultipartBody.Part?,
    ): UpdateProfileResponse

    // Paso final del registro ("Choose what you like"): guarda los intereses
    // elegidos (o lista vacia con Skip) en el usuario autenticado.
    @POST("api/profile/interests")
    suspend fun saveInterests(@Body body: SaveInterestsRequest): OkResponse

    @GET("api/users/{username}/{type}")
    suspend fun followList(@Path("username") username: String, @Path("type") type: String): FollowListResponse

    @GET("api/users/suggested")
    suspend fun suggestedUsers(): FollowListResponse

    @GET("api/saves")
    suspend fun saves(): PostsResponse

    @Multipart
    @POST("api/versus")
    suspend fun uploadVersus(
        @Part fileA: MultipartBody.Part,
        @Part fileB: MultipartBody.Part,
        @Part("description") description: RequestBody,
        @Part("musicTitle") musicTitle: RequestBody?,
        @Part("musicArtist") musicArtist: RequestBody?,
        @Part("musicArtwork") musicArtwork: RequestBody?,
        @Part("musicPreviewUrl") musicPreviewUrl: RequestBody?,
        @Part("musicTrackId") musicTrackId: RequestBody?,
    ): UploadPostResponse

    @Multipart
    @POST("api/duet")
    suspend fun uploadDuet(
        @Part fileA: MultipartBody.Part,
        @Part fileB: MultipartBody.Part,
        @Part("description") description: RequestBody,
        @Part("layout") layout: RequestBody,
        @Part("musicTitle") musicTitle: RequestBody?,
        @Part("musicArtist") musicArtist: RequestBody?,
        @Part("musicArtwork") musicArtwork: RequestBody?,
        @Part("musicPreviewUrl") musicPreviewUrl: RequestBody?,
        @Part("musicTrackId") musicTrackId: RequestBody?,
    ): UploadPostResponse

    @GET("api/users")
    suspend fun users(@Query("q") q: String?): UsersResponse

    // GET /api/music/search?q=... — proxy del backend a la búsqueda de iTunes
    // (evita CORS/claves desde el cliente; réplica de MusicPicker.jsx web).
    @GET("api/music/search")
    suspend fun searchMusic(@Query("q") q: String): MusicSearchResponse

    @Multipart
    @POST("api/challenges")
    suspend fun createChallenge(
        @Part file: MultipartBody.Part,
        @Part("targetAuthor") targetAuthor: RequestBody,
        @Part("message") message: RequestBody,
        @Part("targetVideoUrl") targetVideoUrl: RequestBody,
        @Part("targetPosterUrl") targetPosterUrl: RequestBody,
        @Part("targetDescription") targetDescription: RequestBody,
        @Part("targetMusic") targetMusic: RequestBody,
        @Part("musicTitle") musicTitle: RequestBody?,
        @Part("musicArtist") musicArtist: RequestBody?,
        @Part("musicArtwork") musicArtwork: RequestBody?,
        @Part("musicPreviewUrl") musicPreviewUrl: RequestBody?,
        @Part("musicTrackId") musicTrackId: RequestBody?,
    ): ChallengeResponse

    @GET("api/notifications")
    suspend fun notifications(): NotificationsResponse

    @GET("api/notifications/unread")
    suspend fun unreadNotificationsCount(): UnreadCountResponse

    @POST("api/notifications/read")
    suspend fun markNotificationsRead(@Body body: MarkReadRequest): OkResponse

    @GET("api/challenges")
    suspend fun challenges(@Query("role") role: String = "to"): ChallengesResponse

    @GET("api/challenges/completed")
    suspend fun completedBattles(): PostsResponse

    // BUG reportado por el usuario ("no puedo aceptar el reto"): la web
    // (ActiveChallengesPage.jsx `accept()`) hace un POST SIN body en absoluto
    // cuando el reto ya trae contenido objetivo (no hace falta subir nada) —
    // `fetch(url, {method:'POST'})`, ni siquiera FormData vacío. El nativo
    // usaba SIEMPRE `@Multipart` con un único `@Part file` NULLABLE: cuando
    // `file` era null (ese mismo caso: reto creado con `targetVideoUrl` ya
    // presente, p.ej. al retar tocando el icono de espadas sobre una
    // publicación EXISTENTE de alguien, ver QuickChallenge.kt), Retrofit
    // omite la parte nula correctamente, pero el `MultipartBody.Builder` de
    // OkHttp EXIGE al menos 1 parte -> lanza `IllegalStateException` al
    // construir la petición, ANTES de enviarla siquiera. Esa excepción caía
    // en el `runCatching{}` de `acceptChallenge()` (Battles.kt) SIN ningún
    // `.onFailure`, así que el fallo era totalmente silencioso: el botón
    // "Accept" no hacía nada visible. FIX: 2 endpoints separados — este
    // (con archivo, para retos "de mención" que exigen subir una respuesta)
    // y `acceptChallengeNoFile` (sin body, para retos con contenido objetivo
    // ya presente) — réplica exacta de la rama if/else de `accept()` en la
    // web.
    @Multipart
    @POST("api/challenges/{id}/accept")
    suspend fun acceptChallenge(@Path("id") id: String, @Part file: MultipartBody.Part): UploadPostResponse

    @POST("api/challenges/{id}/accept")
    suspend fun acceptChallengeNoFile(@Path("id") id: String): UploadPostResponse

    @POST("api/challenges/{id}/reject")
    suspend fun rejectChallenge(@Path("id") id: String): OkResponse

    // ── Reportes / Bloqueos / Eliminar publicación (paridad con la web) ────────
    @POST("api/reports")
    suspend fun createReport(@Body body: CreateReportRequest): ReportResponse

    @POST("api/users/block")
    suspend fun blockUser(@Body body: BlockRequest): BlockResponse

    // @DELETE de Retrofit no admite @Body por defecto; se usa @HTTP con
    // hasBody=true (el backend SÍ espera un body JSON en el DELETE, ver
    // handleUnblockUser en route.js).
    @HTTP(method = "DELETE", path = "api/users/block", hasBody = true)
    suspend fun unblockUser(@Body body: BlockRequest): BlockResponse

    @DELETE("api/posts/{id}")
    suspend fun deletePost(@Path("id") id: String): OkResponse

    @DELETE("api/comments/{id}")
    suspend fun deleteComment(@Path("id") id: String): OkResponse

    // ── Sesión / Términos (paridad con la web) ─────────────────────────────────
    @GET("api/auth/me")
    suspend fun me(): MeResponse

    @POST("api/auth/accept-terms")
    suspend fun acceptTerms(): AcceptTermsResponse
}

object RetrofitProvider {
    val api: TwykApi by lazy {
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            // Añade el token Bearer (si hay sesión) a todas las peticiones.
            .addInterceptor { chain ->
                val token = Session.token
                val request = if (token != null) {
                    chain.request().newBuilder()
                        .header("Authorization", "Bearer $token")
                        .build()
                } else {
                    chain.request()
                }
                chain.proceed(request)
            }
            .build()
        Retrofit.Builder()
            .baseUrl(Config.BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(TwykApi::class.java)
    }
}
