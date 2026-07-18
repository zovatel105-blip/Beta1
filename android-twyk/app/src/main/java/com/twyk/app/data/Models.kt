package com.twyk.app.data

// Modelos que reflejan el JSON del backend Next.js (mismas claves).

data class Author(
    val username: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
)

data class Side(
    val videoUrl: String? = null,
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
    val posterUrl: String? = null,
    val thumbnailUrl: String? = null,
    val stats: Stats? = null,
)

data class UploadsResponse(val posts: List<Post>? = null)

data class FeedResponse(
    val posts: List<Post>? = null,
    val nextCursor: Int? = null,
    val hasMore: Boolean? = null,
)

data class VoteRequest(val id: String, val side: String)

data class VoteResponse(val votes: Votes? = null)

// ── Usuario / sesión ──────────────────────────────────────────────────────────
data class User(
    val id: String? = null,
    val username: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
    val verified: Boolean = false,
)

data class LoginRequest(val username: String, val password: String)
data class RegisterRequest(val username: String, val email: String, val password: String)
data class AuthResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val user: User? = null,
    val error: String? = null,
    val message: String? = null,
)

// ── Comentarios ───────────────────────────────────────────────────────────────
data class Comment(
    val id: String = "",
    val text: String = "",
    val likes: Int = 0,
    val userLiked: Boolean = false,
    val isOwn: Boolean = false,
    val timestamp: String? = null,
    val author: Author? = null,
)

data class CommentsResponse(val comments: List<Comment>? = null)
data class CreateCommentRequest(val postId: String, val text: String, val parentId: String? = null)
data class CreateCommentResponse(val ok: Boolean = false, val comment: Comment? = null)
data class LikeCommentRequest(val commentId: String)
data class LikeResponse(val ok: Boolean = false, val likes: Int = 0, val userLiked: Boolean = false)

// ── Guardados ─────────────────────────────────────────────────────────────────
data class SaveRequest(val postId: String)
data class SaveResponse(val ok: Boolean = false, val saved: Boolean = false)

// ── Subida ────────────────────────────────────────────────────────────────────
data class UploadPostResponse(val ok: Boolean = false, val post: Post? = null)

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
