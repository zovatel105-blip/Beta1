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
