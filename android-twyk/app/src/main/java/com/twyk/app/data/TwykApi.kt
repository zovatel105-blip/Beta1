package com.twyk.app.data

import com.twyk.app.Config
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
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

    // "Fire" 🔥 — voto único (toggle) de una publicación 'Single'/reto
    // abierto (ver OpenChallengePage en VersusFeed.kt). Réplica exacta de
    // POST /api/single-vote (web: OpenChallengeSlide.jsx).
    @POST("api/single-vote")
    suspend fun singleVote(@Body body: SingleVoteRequest): SingleVoteResponse

    // TWYK Engine: registra un compartido (fire-and-forget, alimenta el feed).
    @POST("api/share")
    suspend fun share(@Body body: ShareRequest): ShareResponse

    // Contador visible de "reproducciones" (stats.views) de una publicación —
    // fire-and-forget, sin auth requerida, réplica exacta de POST /api/post-view
    // (web: ProfilePage.jsx PostViewer). Ver Profile.kt (única llamada, al abrir/
    // pasar a cada publicación del visor del grid, propio o ajeno).
    @POST("api/post-view")
    suspend fun postView(@Body body: PostViewRequest): PostViewResponse

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

    // Editor de fotos con IA (creación de contenido, réplica de
    // AIImageEditor.jsx web) — SOLO fotos (mismo criterio que la web, ver
    // ui/Upload.kt). suggestEdits analiza la foto y devuelve ideas de edición
    // relevantes; editImage aplica la instrucción y devuelve la foto editada
    // como data URL base64 (misma respuesta exacta que /api/ai/edit-image).
    @Multipart
    @POST("api/ai/suggest-edits")
    suspend fun suggestEdits(@Part image: MultipartBody.Part): SuggestEditsResponse

    @Multipart
    @POST("api/ai/edit-image")
    suspend fun editImage(
        @Part image: MultipartBody.Part,
        @Part("prompt") prompt: RequestBody,
    ): EditImageResponse

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
        // "Luxury Battle" (petición del usuario, ver ui/Battles.kt/
        // LuxuryBattleSheet): id del tema activo si este reto se creó desde
        // esa hoja — null en un reto normal (Retrofit omite la parte @Part
        // por completo cuando su RequestBody es null, igual que la música).
        @Part("luxuryThemeId") luxuryThemeId: RequestBody? = null,
    ): ChallengeResponse

    // Publicación ÚNICA ("Single", modo `solo` en ui/Upload.kt) — mismo
    // endpoint POST /api/challenges que createChallenge, pero con
    // openChallenge=1 en vez de targetAuthor: el backend (handleChallenges en
    // route.js) omite TODA la validación/campos de destinatario cuando este
    // flag viene a "1" (open:true, to:null) — réplica exacta del modo `solo`
    // de UploadDialog.jsx (web), que reutiliza el mismo endpoint así. Aparece
    // con un botón "Challenge" en el feed principal (cualquiera puede retar a
    // su creador, ver getOpenChallengeFeedItems) y en el grid de su propio
    // perfil (GET /api/users/{username} ya la fusiona con sus posts). NUNCA
    // lleva `luxuryThemeId` (petición del usuario: "las publicaciones single
    // no deben estar en las batallas porque solo existen para ser retadas").
    @Multipart
    @POST("api/challenges")
    suspend fun createOpenChallenge(
        @Part file: MultipartBody.Part,
        @Part("openChallenge") openChallenge: RequestBody,
        @Part("message") message: RequestBody,
        @Part("musicTitle") musicTitle: RequestBody?,
        @Part("musicArtist") musicArtist: RequestBody?,
        @Part("musicArtwork") musicArtwork: RequestBody?,
        @Part("musicPreviewUrl") musicPreviewUrl: RequestBody?,
        @Part("musicTrackId") musicTrackId: RequestBody?,
    ): ChallengeResponse

    // "Luxury Battle" — tema activo (público, sin sesión) y su leaderboard
    // (votos reales + puntaje de IA), réplica exacta de GET
    // /api/luxury-battles/active y /api/luxury-battles/leaderboard (web).
    @GET("api/luxury-battles/active")
    suspend fun luxuryBattleActive(): LuxuryThemeResponse

    @GET("api/luxury-battles/leaderboard")
    suspend fun luxuryBattleLeaderboard(): LuxuryLeaderboardResponse

    // GET /api/luxury-battles/posts?themeId=... — TODAS las publicaciones
    // reales (de cualquier usuario) etiquetadas con un "Trending Challenge"
    // concreto (por defecto, el activo si themeId es null) — réplica exacta
    // del endpoint añadido en la web (route.js) para alimentar la pantalla
    // de grid ui/TrendingChallengePosts.kt, abierta desde el nombre del
    // challenge en el buscador (ui/Search.kt). Solo se usa `posts` de la
    // respuesta (PostsResponse, ya usado por completedBattles/saves más
    // abajo); el campo `theme` del JSON se ignora aquí porque la pantalla ya
    // obtiene el tema (título) por separado vía luxuryBattleActive().
    @GET("api/luxury-battles/posts")
    suspend fun luxuryBattlePosts(@Query("themeId") themeId: String? = null): PostsResponse

    @GET("api/notifications")
    suspend fun notifications(): NotificationsResponse

    @GET("api/notifications/unread")
    suspend fun unreadNotificationsCount(): UnreadCountResponse

    @POST("api/notifications/read")
    suspend fun markNotificationsRead(@Body body: MarkReadRequest): OkResponse

    // Notificaciones push (Firebase Cloud Messaging) — ver
    // data/PushTokenManager.kt (quién llama a estos 2 endpoints) y backend
    // lib/push.js. `unregisterPushToken` usa `@HTTP` con `hasBody=true`
    // porque `@DELETE` de Retrofit no admite `@Body` por defecto (mismo
    // patrón ya usado más abajo para `unblockUser`).
    @POST("api/push/tokens")
    suspend fun registerPushToken(@Body body: RegisterPushTokenRequest): OkResponse

    @HTTP(method = "DELETE", path = "api/push/tokens", hasBody = true)
    suspend fun unregisterPushToken(@Body body: UnregisterPushTokenRequest): OkResponse

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
