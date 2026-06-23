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
  NOTIFICATIONS: 'notifications',
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

// Lista de TODOS los usuarios registrados (sin password). Para elegir a quién
// retar en la creación. Opcionalmente excluye un username (el usuario actual).
export async function getAllUsers({ excludeUsername = null } = {}) {
  const users = await getCollection(COLLECTIONS.USERS)
  const query = excludeUsername ? { username: { $ne: excludeUsername } } : {}
  const list = await users.find(query).sort({ createdAt: -1 }).toArray()
  return list.map((u) => ({
    username: u.username,
    name: u.name || u.username,
    avatarUrl: u.avatarUrl || '',
    verified: u.verified || false,
  }))
}

export async function getUserById(id) {
  const users = await getCollection(COLLECTIONS.USERS)
  return await users.findOne({ id })
}

// Actualiza los campos editables del perfil (nombre, bio, avatar).
// Solo aplica los campos definidos; devuelve el usuario actualizado sin password.
export async function updateUserProfile(userId, { name, bio, avatarUrl } = {}) {
  const users = await getCollection(COLLECTIONS.USERS)
  const updates = {}
  if (typeof name === 'string') updates.name = name.trim().slice(0, 60)
  if (typeof bio === 'string') updates.bio = bio.trim().slice(0, 300)
  if (typeof avatarUrl === 'string' && avatarUrl) updates.avatarUrl = avatarUrl
  if (Object.keys(updates).length === 0) {
    const current = await users.findOne({ id: userId })
    if (!current) return null
    const { password: _p, ...rest } = current
    return rest
  }
  updates.updatedAt = new Date()
  await users.updateOne({ id: userId }, { $set: updates })
  const updated = await users.findOne({ id: userId })
  if (!updated) return null
  const { password: _, ...userWithoutPassword } = updated
  return userWithoutPassword
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
    expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // ~10 años (sesión permanente)
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

export async function createComment({ postId, userId, text, votedSide = null }) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  const users = await getCollection(COLLECTIONS.USERS)
  const posts = await getCollection(COLLECTIONS.POSTS)
  
  const user = await users.findOne({ id: userId })
  if (!user) throw new Error('user_not_found')

  const post = await posts.findOne({ id: postId })

  const safeVotedSide = votedSide === 'a' || votedSide === 'b' ? votedSide : null

  const comment = {
    id: generateId(),
    postId,
    userId,
    text,
    votedSide: safeVotedSide,
    likes: 0,
    likedBy: [],
    createdAt: new Date(),
  }

  await comments.insertOne(comment)
  
  // Crear notificación al autor del post (si no es el mismo usuario)
  if (post && post.userId && post.userId !== userId) {
    await createNotification({
      userId: post.userId,
      type: 'comment',
      fromUserId: userId,
      postId: postId,
      commentId: comment.id,
      text: text.length > 50 ? text.substring(0, 47) + '...' : text,
    })
  }
  
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
        votedSide: comment.votedSide || null,
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
  const result = await posts.updateOne(
    { id: postId },
    { $inc: { [field]: 1 } }
  )

  // Si el post NO existe en la colección MongoDB POSTS (p.ej. las publicaciones
  // subidas que viven en _meta.json), lanzamos para que handleVote caiga al
  // store de archivos y persista el voto allí. Sin esto, updateOne no matchea
  // nada, findOne devuelve null y se retornaba {a:0,b:0} SIN persistir -> el
  // voto "no se mantenía" y tampoco se creaba notificación.
  if (result.matchedCount === 0) {
    throw new Error('post_not_found_in_mongo')
  }

  const post = await posts.findOne({ id: postId })
  
  // Crear notificación si hay userId y el post tiene autor
  if (userId && post && post.userId && post.userId !== userId) {
    await createNotification({
      userId: post.userId,
      type: 'vote',
      fromUserId: userId,
      postId: post.id,
      side: side,
    })
  }
  
  return post?.votes || { a: 0, b: 0 }
}

/**
 * NOTIFICACIONES
 */

export async function createNotification({ userId, type, fromUserId, postId, commentId, text, side }) {
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  const users = await getCollection(COLLECTIONS.USERS)
  
  const fromUser = fromUserId ? await users.findOne({ id: fromUserId }) : null

  const notification = {
    id: generateId(),
    userId,
    type, // 'vote', 'challenge', 'accepted', 'follow', 'comment'
    fromUser: fromUser ? {
      id: fromUser.id,
      username: fromUser.username,
      name: fromUser.name,
      avatarUrl: fromUser.avatarUrl,
    } : null,
    postId: postId || null,
    commentId: commentId || null,
    text: text || null,
    side: side || null,
    read: false,
    createdAt: new Date(),
  }

  await notifications.insertOne(notification)
  return notification
}

export async function getNotifications(userId, { filter = 'all', limit = 50 } = {}) {
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  
  let query = { userId }
  
  // Filtros por tipo
  if (filter === 'challenge') {
    query.type = { $in: ['challenge', 'accepted'] }
  } else if (filter !== 'all') {
    query.type = filter
  }

  const notificationsList = await notifications
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()

  return notificationsList.map(n => ({
    id: n.id,
    type: n.type,
    user: n.fromUser,
    text: n.text || (n.type === 'comment' ? `comentó: "${n.text}"` : getNotificationText(n.type)),
    time: formatNotificationTime(n.createdAt),
    read: n.read,
    postId: n.postId,
    side: n.side,
  }))
}

export async function markNotificationAsRead(notificationId) {
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  await notifications.updateOne(
    { id: notificationId },
    { $set: { read: true } }
  )
}

export async function markAllNotificationsAsRead(userId) {
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  await notifications.updateMany(
    { userId, read: false },
    { $set: { read: true } }
  )
}

export async function getUnreadNotificationsCount(userId) {
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  return await notifications.countDocuments({ userId, read: false })
}

function getNotificationText(type) {
  switch (type) {
    case 'vote': return 'votó tu vídeo en un reto'
    case 'challenge': return 'te ha retado a una batalla'
    case 'accepted': return 'aceptó tu reto'
    case 'follow': return 'empezó a seguirte'
    case 'comment': return 'comentó en tu vídeo'
    default: return 'interactuó contigo'
  }
}

function formatNotificationTime(date) {
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  if (hours < 24) return `hace ${hours} h`
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return date.toLocaleDateString()
}

/**
 * FOLLOWS (SEGUIR USUARIOS)
 */

export async function followUser(followerId, followingId) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const users = await getCollection(COLLECTIONS.USERS)
  
  if (followerId === followingId) {
    throw new Error('cannot_follow_yourself')
  }

  // Verificar si ya sigue
  const existing = await follows.findOne({ followerId, followingId })
  if (existing) {
    throw new Error('already_following')
  }

  // Crear follow
  await follows.insertOne({
    id: generateId(),
    followerId,
    followingId,
    createdAt: new Date(),
  })

  // Actualizar contadores
  await users.updateOne({ id: followerId }, { $inc: { following: 1 } })
  await users.updateOne({ id: followingId }, { $inc: { followers: 1 } })

  // Crear notificación
  await createNotification({
    userId: followingId,
    type: 'follow',
    fromUserId: followerId,
  })

  return { ok: true, following: true }
}

export async function unfollowUser(followerId, followingId) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const users = await getCollection(COLLECTIONS.USERS)

  const result = await follows.deleteOne({ followerId, followingId })
  
  if (result.deletedCount > 0) {
    // Actualizar contadores
    await users.updateOne({ id: followerId }, { $inc: { following: -1 } })
    await users.updateOne({ id: followingId }, { $inc: { followers: -1 } })
  }

  return { ok: true, following: false }
}

export async function isFollowing(followerId, followingId) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const follow = await follows.findOne({ followerId, followingId })
  return !!follow
}

/**
 * FOLLOWS POR USERNAME (universal)
 * La relación se guarda como { followerId, followingUsername } para poder
 * seguir tanto a usuarios registrados como a autores demo (que no tienen
 * documento en la colección de usuarios). El seguidor SIEMPRE es un usuario
 * autenticado real (tiene id).
 */
export async function toggleFollowByUsername(followerId, followingUsername) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const existing = await follows.findOne({ followerId, followingUsername })

  if (existing) {
    await follows.deleteOne({ followerId, followingUsername })
  } else {
    await follows.insertOne({
      id: generateId(),
      followerId,
      followingUsername,
      createdAt: new Date(),
    })
    // Notificar al usuario destino si está registrado (tiene documento en DB).
    try {
      const users = await getCollection(COLLECTIONS.USERS)
      const target = await users.findOne({ username: followingUsername })
      if (target && target.id) {
        await createNotification({ userId: target.id, type: 'follow', fromUserId: followerId })
      }
    } catch { /* ignore */ }
  }

  const following = !existing
  const followers = await follows.countDocuments({ followingUsername })
  return { following, followers }
}

export async function isFollowingByUsername(followerId, followingUsername) {
  if (!followerId) return false
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const doc = await follows.findOne({ followerId, followingUsername })
  return !!doc
}

export async function getFollowersCountByUsername(followingUsername) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  return await follows.countDocuments({ followingUsername })
}

// Cuántos usuarios sigue `username` (cuenta real desde la colección de follows).
export async function getFollowingCountByUsername(username) {
  const users = await getCollection(COLLECTIONS.USERS)
  const owner = await users.findOne({ username })
  if (!owner) return 0
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  return await follows.countDocuments({ followerId: owner.id })
}

// Mapea un documento de usuario a la forma pública usada en listas.
function publicUserShape(u) {
  if (!u) return null
  return {
    username: u.username,
    name: u.name || u.username,
    avatarUrl: u.avatarUrl || '',
    verified: u.verified || false,
  }
}

// Lista de usuarios que SIGUEN a `username` (sus followers).
// Los follows se guardan como { followerId, followingUsername }, así que
// resolvemos cada followerId a su documento de usuario.
export async function getFollowersByUsername(username, currentUserId = null) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const users = await getCollection(COLLECTIONS.USERS)
  const docs = await follows
    .find({ followingUsername: username })
    .sort({ createdAt: -1 })
    .toArray()
  const ids = docs.map((d) => d.followerId).filter(Boolean)
  if (ids.length === 0) return []
  const userDocs = await users.find({ id: { $in: ids } }).toArray()
  const byId = new Map(userDocs.map((u) => [u.id, u]))

  // ¿A quién sigue el usuario actual? (para mostrar el estado del botón)
  let myFollowing = new Set()
  if (currentUserId) {
    const mine = await follows.find({ followerId: currentUserId }).toArray()
    myFollowing = new Set(mine.map((m) => m.followingUsername))
  }

  // Mantener el orden de los follows (más reciente primero) y descartar nulos.
  const out = []
  for (const id of ids) {
    const u = byId.get(id)
    if (!u) continue
    const shape = publicUserShape(u)
    shape.isFollowing = myFollowing.has(u.username)
    out.push(shape)
  }
  return out
}

// Lista de usuarios a los que `username` SIGUE (following).
// Necesitamos el id del usuario para buscar sus follows.
export async function getFollowingByUsername(username, currentUserId = null) {
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const users = await getCollection(COLLECTIONS.USERS)
  const owner = await users.findOne({ username })
  if (!owner) return []
  const docs = await follows
    .find({ followerId: owner.id })
    .sort({ createdAt: -1 })
    .toArray()
  const usernames = docs.map((d) => d.followingUsername).filter(Boolean)
  if (usernames.length === 0) return []
  const userDocs = await users.find({ username: { $in: usernames } }).toArray()
  const byName = new Map(userDocs.map((u) => [u.username, u]))

  let myFollowing = new Set()
  if (currentUserId) {
    const mine = await follows.find({ followerId: currentUserId }).toArray()
    myFollowing = new Set(mine.map((m) => m.followingUsername))
  }

  const out = []
  for (const uname of usernames) {
    const u = byName.get(uname)
    // Si el usuario seguido no está registrado (autor demo), usar datos básicos.
    const shape = u
      ? publicUserShape(u)
      : { username: uname, name: uname, avatarUrl: '', verified: false }
    shape.isFollowing = myFollowing.has(uname)
    out.push(shape)
  }
  return out
}

