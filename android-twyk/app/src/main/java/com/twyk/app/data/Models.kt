package com.twyk.app.data

// Modelos que reflejan el JSON del backend Next.js (mismas claves).

data class Author(
    val username: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
    // El backend anota este campo en /api/uploads y /api/feed (ver `annotate`
    // en route.js) para que el botón Follow/Following del feed refleje el
    // estado real y persista tras recargar, igual que en la web.
    val isFollowing: Boolean = false,
)

data class Side(
    val videoUrl: String? = null,
    val imageUrl: String? = null,
    val mediaType: String? = null, // "video" | "image" — foto o vídeo (paridad con la web)
    val posterUrl: String? = null,
    val author: Author? = null,
    val description: String? = null,
    val music: String? = null,
)

data class Votes(
    val a: Int = 0,
    val b: Int = 0,
)

data class Stats(
    val likes: Int = 0,
    val comments: Int = 0,
    val shares: Int = 0,
    val saves: Int = 0,
    val challenges: Int = 0,
)

data class Post(
    val id: String = "",
    val type: String = "",
    val layout: String? = null,
    val sideA: Side? = null,
    val sideB: Side? = null,
    val votes: Votes? = null,
    val isChallenge: Boolean? = null,
    val description: String? = null,
    val author: Author? = null,
    val music: String? = null,
    val mediaType: String? = null, // "video" | "image" (a nivel de post, misma info que sideA/sideB)
    val posterUrl: String? = null,
    val thumbnailUrl: String? = null,
    val stats: Stats? = null,
    // Música adjunta REAL (preview de iTunes de 30s), devuelta por el backend
    // vía readMusicFields() en route.js. Antes se descartaba (solo se leía el
    // campo `music`, que es solo la etiqueta de texto "Título · Artista") ->
    // el feed nativo NUNCA reproducía la música adjunta, solo la mostraba
    // como texto. Ver MusicDisc/CarouselPage/DuetPage para la reproducción.
    val musicPreviewUrl: String? = null,
    val musicTitle: String? = null,
    val musicArtist: String? = null,
    val musicArtwork: String? = null,
)

data class UploadsResponse(val posts: List<Post>? = null)

data class FeedResponse(
    val posts: List<Post>? = null,
    val nextCursor: Int? = null,
    val hasMore: Boolean? = null,
)

// previousSide: lado que este mismo usuario había votado ANTES en esta
// publicación (null si es su primer voto). El backend lo usa para CAMBIAR de
// opción en una sola operación atómica (resta al anterior, suma al nuevo) en
// vez de sumar un voto extra — ver handleVote en route.js. Réplica exacta del
// body { id, side, previousSide } que ya envía CarouselSlide.jsx/DuetSlide.jsx.
data class VoteRequest(val id: String, val side: String, val previousSide: String? = null)

// TWYK Engine: registrar un compartido (señal fuerte del algoritmo del feed).
data class ShareRequest(val id: String)
data class ShareResponse(val ok: Boolean? = null)

data class VoteResponse(val votes: Votes? = null)

// ── Usuario / sesión ──────────────────────────────────────────────────────────
data class User(
    val id: String? = null,
    val username: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
    val verified: Boolean = false,
    val termsAccepted: Boolean = false,
    // Rol de la cuenta ('admin' | 'user'). El backend ya lo incluye en el
    // usuario devuelto por /api/auth/login, /api/auth/register y /api/auth/me
    // (ver createUser en lib/db.js); se usa para mostrar la sección
    // "Administration" del panel de Ajustes, igual que isAdmin en la web
    // (ProfilePage.jsx: user?.role === 'admin').
    val role: String? = null,
)

data class LoginRequest(val username: String, val password: String)
// birthDate ('YYYY-MM-DD') es OBLIGATORIO para el backend (gating de edad
// COPPA, ver handleRegister en route.js): sin este campo, /api/auth/register
// devuelve 400 'birthdate_required' y el registro falla SIEMPRE.
data class RegisterRequest(val username: String, val email: String, val password: String, val birthDate: String)
data class AuthResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val user: User? = null,
    val error: String? = null,
    val message: String? = null,
)
data class MeResponse(val user: User? = null, val error: String? = null)
data class AcceptTermsResponse(val ok: Boolean = false, val user: User? = null, val error: String? = null)

// ── Comentarios ───────────────────────────────────────────────────────────────
data class Comment(
    val id: String = "",
    val postId: String? = null,
    val text: String = "",
    val votedSide: String? = null,
    val parentId: String? = null,
    val replyToId: String? = null,
    val replyToUsername: String? = null,
    val likes: Int = 0,
    val userLiked: Boolean = false,
    val isOwn: Boolean = false,
    val canDelete: Boolean = false,
    val timestamp: String? = null,
    val author: Author? = null,
)

data class CommentsResponse(val comments: List<Comment>? = null)
// votedSide: voto ACTUAL del usuario sobre la publicación en el momento de
// comentar (réplica exacta de `votedSide` en el body que envía
// CommentsModal.jsx al POST /api/comments) — así el nuevo comentario queda
// con el punto de color de equipo desde el primer instante, igual que en la web.
data class CreateCommentRequest(val postId: String, val text: String, val parentId: String? = null, val votedSide: String? = null)
data class CreateCommentResponse(val ok: Boolean = false, val comment: Comment? = null)
data class LikeCommentRequest(val commentId: String)
data class LikeResponse(val ok: Boolean = false, val likes: Int = 0, val userLiked: Boolean = false)

// ── Guardados ─────────────────────────────────────────────────────────────────
data class SaveRequest(val postId: String)
data class SaveResponse(val ok: Boolean = false, val saved: Boolean = false)

// ── Subida ────────────────────────────────────────────────────────────────────
data class UploadPostResponse(val ok: Boolean = false, val post: Post? = null)

// ── Música (iTunes, vía proxy del backend) ─────────────────────────────────────
data class MusicTrack(
    val id: String? = null,
    val title: String? = null,
    val artist: String? = null,
    val artwork: String? = null,
    val previewUrl: String? = null,
    val duration: Int = 30,
)
data class MusicSearchResponse(val results: List<MusicTrack>? = null)

data class UsersResponse(val users: List<User>? = null)
data class ChallengeResponse(val ok: Boolean = false, val error: String? = null, val message: String? = null)

// Objetivo de un "Retar rápido" a una publicación concreta del feed (equivalente
// al `target` que la web construye en CarouselSlide.jsx/DuetSlide.jsx al pulsar
// el icono de espadas sobre un lado específico).
data class QuickChallengeTarget(
    val postId: String,
    val author: Author?,
    val videoUrl: String?,
    val posterUrl: String?,
    val description: String?,
    val music: String?,
)

// ── Notificaciones / Retos (buzón y batallas) ─────────────────────────────────
data class NotificationItem(
    val id: String = "",
    val type: String = "",
    val user: User? = null,
    val text: String? = null,
    val time: String? = null,
    val read: Boolean = false,
    val side: String? = null,
    val postId: String? = null,
    val commentId: String? = null,
)
data class NotificationsResponse(val notifications: List<NotificationItem>? = null)
data class MarkReadRequest(val all: Boolean? = null, val id: String? = null, val types: List<String>? = null)
// GET /api/notifications/unread — contador de notificaciones no leídas, usado
// para el globo rojo del icono "Inbox" en la barra inferior (réplica de
// BottomNav.jsx, que hace polling de este mismo endpoint cada 30s).
data class UnreadCountResponse(val count: Int = 0)

data class Challenge(
    val id: String = "",
    val status: String? = null,
    val from: User? = null,
    val to: User? = null,
    val message: String? = null,
    val challengerMediaType: String? = null,
    val challengerVideoUrl: String? = null,
    val challengerImageUrl: String? = null,
    val challengerPosterUrl: String? = null,
    val targetMediaType: String? = null,
    val targetVideoUrl: String? = null,
    val targetImageUrl: String? = null,
    val targetPosterUrl: String? = null,
    val createdAt: String? = null,
)
data class ChallengesResponse(val challenges: List<Challenge>? = null)
data class PostsResponse(val posts: List<Post>? = null)
data class OkResponse(val ok: Boolean = false, val error: String? = null)

// Paso final del registro ("Choose what you like") -> POST /api/profile/interests
data class SaveInterestsRequest(val interests: List<String>)

// ── Perfil ────────────────────────────────────────────────────────────────────
data class ProfileUser(
    val username: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
    val verified: Boolean = false,
    val followers: Int = 0,
    val following: Int = 0,
    val bio: String? = null,
    val isFollowing: Boolean = false,
    val reason: String? = null,
)

data class ProfileResponse(val user: ProfileUser? = null, val posts: List<Post>? = null)
data class FollowResponse(val ok: Boolean = false, val following: Boolean = false, val followers: Int = 0)
data class UpdateProfileResponse(val ok: Boolean = false, val user: ProfileUser? = null, val error: String? = null)
data class FollowListResponse(val users: List<ProfileUser>? = null)
