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

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @GET("api/users/{username}")
    suspend fun userProfile(@Path("username") username: String): ProfileResponse

    @POST("api/users/{username}/follow")
    suspend fun toggleFollow(@Path("username") username: String): FollowResponse

    @Multipart
    @POST("api/versus")
    suspend fun uploadVersus(
        @Part fileA: MultipartBody.Part,
        @Part fileB: MultipartBody.Part,
        @Part("description") description: RequestBody,
    ): UploadPostResponse

    @Multipart
    @POST("api/duet")
    suspend fun uploadDuet(
        @Part fileA: MultipartBody.Part,
        @Part fileB: MultipartBody.Part,
        @Part("description") description: RequestBody,
        @Part("layout") layout: RequestBody,
    ): UploadPostResponse
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
