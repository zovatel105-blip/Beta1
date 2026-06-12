import { getCollection } from './mongodb'
import { hashPassword, verifyPassword, generateSessionToken, generateId } from './auth'

/**
 * Colecciones de MongoDB
 */
export const COLLECTIONS = {
  USERS: 'users',
  COMMENTS: 'comments',
  POSTS: 'posts',
  SAVES: 'saves',
  FOLLOWS: 'follows',
  SESSIONS: 'sessions',
}

/**
 * USUARIOS
 */

export async function createUser({ username, email, password, avatarUrl = null }) {
  const users = await getCollection(COLLECTIONS.USERS)
  
  // Verificar si ya existe
  const existing = await users.findOne({ 
    $or: [{ username }, { email }] 
  })
  
  if (existing) {
    throw new Error(existing.username === username ? 'username_taken' : 'email_taken')
  }

  const user = {
    id: generateId(),
    username,
    email,
    password: hashPassword(password),
    avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    name: username,
    bio: '',
    verified: false,
    followers: 0,
    following: 0,
    likes: 0,
    createdAt: new Date(),
  }

  await users.insertOne(user)
  
  // Retornar sin password
  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}

export async function getUserByUsername(username) {
  const users = await getCollection(COLLECTIONS.USERS)
  return await users.findOne({ username })
}

export async function getUserById(id) {
  const users = await getCollection(COLLECTIONS.USERS)
  return await users.findOne({ id })
}

export async function verifyUserCredentials(username, password) {
  const user = await getUserByUsername(username)
  if (!user) return null
  
  if (!verifyPassword(password, user.password)) return null
  
  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}

/**
 * SESIONES
 */

export async function createSession(userId) {
  const sessions = await getCollection(COLLECTIONS.SESSIONS)
  
  const session = {
    id: generateId(),
    token: generateSessionToken(),
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
  }

  await sessions.insertOne(session)
  return session
}

export async function getSessionByToken(token) {
  const sessions = await getCollection(COLLECTIONS.SESSIONS)
  const session = await sessions.findOne({ token })
  
  if (!session) return null
  if (new Date() > session.expiresAt) {
    await sessions.deleteOne({ token })
    return null
  }
  
  return session
}

export async function deleteSession(token) {
  const sessions = await getCollection(COLLECTIONS.SESSIONS)
  await sessions.deleteOne({ token })
}

/**
 * COMENTARIOS
 */

export async function createComment({ postId, userId, text }) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  const users = await getCollection(COLLECTIONS.USERS)
  
  const user = await users.findOne({ id: userId })
  if (!user) throw new Error('user_not_found')

  const comment = {
    id: generateId(),
    postId,
    userId,
    text,
    likes: 0,
    likedBy: [],
    createdAt: new Date(),
  }

  await comments.insertOne(comment)
  
  // Retornar con datos del autor
  return {
    ...comment,
    author: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
    },
  }
}

export async function getCommentsByPostId(postId, currentUserId = null) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  const users = await getCollection(COLLECTIONS.USERS)
  
  const commentsList = await comments.find({ postId }).sort({ createdAt: -1 }).toArray()
  
  // Enriquecer con datos del autor
  const enriched = await Promise.all(
    commentsList.map(async (comment) => {
      const author = await users.findOne({ id: comment.userId })
      return {
        id: comment.id,
        postId: comment.postId,
        text: comment.text,
        likes: comment.likes || 0,
        userLiked: currentUserId ? comment.likedBy?.includes(currentUserId) : false,
        isOwn: currentUserId ? comment.userId === currentUserId : false,
        timestamp: comment.createdAt,
        author: author ? {
          id: author.id,
          username: author.username,
          avatarUrl: author.avatarUrl,
        } : null,
      }
    })
  )
  
  return enriched
}

export async function toggleCommentLike(commentId, userId) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  
  const comment = await comments.findOne({ id: commentId })
  if (!comment) throw new Error('comment_not_found')

  const likedBy = comment.likedBy || []
  const hasLiked = likedBy.includes(userId)

  if (hasLiked) {
    // Quitar like
    await comments.updateOne(
      { id: commentId },
      { 
        $pull: { likedBy: userId },
        $inc: { likes: -1 }
      }
    )
    return { likes: Math.max(0, comment.likes - 1), userLiked: false }
  } else {
    // Agregar like
    await comments.updateOne(
      { id: commentId },
      { 
        $push: { likedBy: userId },
        $inc: { likes: 1 }
      }
    )
    return { likes: (comment.likes || 0) + 1, userLiked: true }
  }
}

export async function deleteComment(commentId, userId) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  
  const comment = await comments.findOne({ id: commentId })
  if (!comment) throw new Error('comment_not_found')
  if (comment.userId !== userId) throw new Error('unauthorized')

  await comments.deleteOne({ id: commentId })
}

/**
 * GUARDADOS/SAVES
 */

export async function toggleSave(postId, userId) {
  const saves = await getCollection(COLLECTIONS.SAVES)
  
  const existing = await saves.findOne({ postId, userId })
  
  if (existing) {
    // Quitar guardado
    await saves.deleteOne({ postId, userId })
    return { saved: false }
  } else {
    // Agregar guardado
    await saves.insertOne({
      id: generateId(),
      postId,
      userId,
      createdAt: new Date(),
    })
    return { saved: true }
  }
}

export async function getSavesByUserId(userId) {
  const saves = await getCollection(COLLECTIONS.SAVES)
  const savesList = await saves.find({ userId }).sort({ createdAt: -1 }).toArray()
  return savesList.map(s => s.postId)
}

/**
 * POSTS/VIDEOS
 */

export async function createPost({ userId, type, videoUrl, posterUrl, description, music, sideA, sideB, layout }) {
  const posts = await getCollection(COLLECTIONS.POSTS)
  const users = await getCollection(COLLECTIONS.USERS)
  
  const user = await users.findOne({ id: userId })
  if (!user) throw new Error('user_not_found')

  const post = {
    id: generateId(),
    userId,
    type, // 'versus', 'duet', 'single'
    layout: layout || 'carousel',
    videoUrl,
    posterUrl,
    thumbnailUrl: posterUrl,
    description,
    music,
    author: {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    sideA: sideA || null,
    sideB: sideB || null,
    stats: {
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      views: 0,
    },
    votes: type === 'versus' || type === 'duet' ? { a: 0, b: 0 } : null,
    createdAt: new Date(),
  }

  await posts.insertOne(post)
  return post
}

export async function getPosts({ cursor = 0, limit = 8 }) {
  const posts = await getCollection(COLLECTIONS.POSTS)
  
  const postsList = await posts
    .find({})
    .sort({ createdAt: -1 })
    .skip(cursor)
    .limit(limit)
    .toArray()

  // Enriquecer con stats reales
  const enriched = await Promise.all(
    postsList.map(async (post) => {
      // Contar comentarios reales
      const comments = await getCollection(COLLECTIONS.COMMENTS)
      const commentCount = await comments.countDocuments({ postId: post.id })
      
      // Contar saves reales
      const saves = await getCollection(COLLECTIONS.SAVES)
      const saveCount = await saves.countDocuments({ postId: post.id })

      return {
        ...post,
        stats: {
          ...post.stats,
          comments: commentCount,
          saves: saveCount,
        },
      }
    })
  )

  const hasMore = (await posts.countDocuments({})) > cursor + limit

  return {
    posts: enriched,
    nextCursor: cursor + limit,
    hasMore,
  }
}

export async function getPostById(postId) {
  const posts = await getCollection(COLLECTIONS.POSTS)
  return await posts.findOne({ id: postId })
}

export async function incrementPostViews(postId) {
  const posts = await getCollection(COLLECTIONS.POSTS)
  await posts.updateOne(
    { id: postId },
    { $inc: { 'stats.views': 1 } }
  )
}

export async function votePost(postId, side, userId = null) {
  const posts = await getCollection(COLLECTIONS.POSTS)
  
  const field = side === 'a' ? 'votes.a' : 'votes.b'
  await posts.updateOne(
    { id: postId },
    { $inc: { [field]: 1 } }
  )

  const post = await posts.findOne({ id: postId })
  return post?.votes || { a: 0, b: 0 }
}

