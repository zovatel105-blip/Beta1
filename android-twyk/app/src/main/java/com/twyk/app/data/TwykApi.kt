package com.twyk.app.data

import com.twyk.app.Config
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface TwykApi {
    @GET("api/uploads")
    suspend fun uploads(): UploadsResponse

    @GET("api/feed")
    suspend fun feed(@Query("cursor") cursor: Int, @Query("limit") limit: Int = 8): FeedResponse

    @POST("api/vote")
    suspend fun vote(@Body body: VoteRequest): VoteResponse
}

object RetrofitProvider {
    val api: TwykApi by lazy {
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        Retrofit.Builder()
            .baseUrl(Config.BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(TwykApi::class.java)
    }
}
