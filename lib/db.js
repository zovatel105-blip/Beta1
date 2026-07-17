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
  REPORTS: 'reports',
  BLOCKS: 'blocks',
}

// Emails con rol admin. Configurable por la variable de entorno ADMIN_EMAILS
// (lista separada por comas). El administrador principal por defecto es
// twyk.apk@gmail.com. El rol admin se concede ÚNICAMENTE a estos correos.
const DEFAULT_ADMIN_EMAILS = ['twyk.apk@gmail.com']
function getAdminEmails() {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const set = new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv])
  return set
}
export function isAdminEmail(email) {
  if (!email) return false
  return getAdminEmails().has(String(email).toLowerCase())
}

/**
 * USUARIOS
 */

export async function createUser({ username, email, password, avatarUrl = null, birthDate = null }) {
  const users = await getCollection(COLLECTIONS.USERS)
  
  // Verificar si ya existe
  const existing = await users.findOne({ 
    $or: [{ username }, { email }] 
  })
  
  if (existing) {
    throw new Error(existing.username === username ? 'username_taken' : 'email_taken')
  }

  // Rol admin: SOLO los correos de la lista admin (por defecto twyk.apk@gmail.com).
  // Ya NO se concede admin al primer usuario registrado.
  const role = isAdminEmail(email) ? 'admin' : 'user'

  const user = {
    id: generateId(),
    username,
    email,
    // Fecha de nacimiento (COPPA): guardada como string 'YYYY-MM-DD'. Puede ser
    // null para usuarios antiguos registrados antes del gating de edad.
    birthDate: birthDate || null,
    password: await hashPassword(password),
    avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    name: username,
    bio: '',
    verified: false,
    role,
    suspended: false,
    // Consentimiento de Términos de Uso / Privacidad / Cookies: false al
    // registrarse; el modal de consentimiento se muestra hasta que el
    // usuario pulse "Accept and Continue" (POST /api/auth/accept-terms).
    termsAccepted: false,
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
export async function getAllUsers({ excludeUsername = null, search = null, limit = 0 } = {}) {
  const users = await getCollection(COLLECTIONS.USERS)
  const query = {}
  if (excludeUsername) query.username = { $ne: excludeUsername }
  if (search && String(search).trim()) {
    // Búsqueda por username o nombre (insensible a mayúsculas). Se escapan los
    // caracteres especiales para evitar regex inyectada.
    const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rx = new RegExp(safe, 'i')
    query.$or = [{ username: rx }, { name: rx }]
  }
  let cursor = users.find(query).sort({ createdAt: -1 })
  if (limit > 0) cursor = cursor.limit(limit)
  const list = await cursor.toArray()
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

// Devuelve un mapa { username -> { avatarUrl, name, verified } } con los datos
// ACTUALES de los usuarios registrados. Se usa para "refrescar" avatares que
// se guardaron denormalizados (ej. en retos) y que quedan obsoletos cuando el
// usuario cambia su foto de perfil.
export async function getCurrentUsersByUsernames(usernames = []) {
  const unique = [...new Set((usernames || []).filter(Boolean))]
  if (unique.length === 0) return {}
  const users = await getCollection(COLLECTIONS.USERS)
  const docs = await users.find({ username: { $in: unique } }).toArray()
  const map = {}
  for (const u of docs) {
    map[u.username] = {
      avatarUrl: u.avatarUrl || '',
      name: u.name || u.username,
      verified: u.verified || false,
    }
  }
  return map
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

// Busca un usuario por nombre de usuario O por email (case-insensitive). Permite
// iniciar sesión con cualquiera de los dos identificadores.
export async function getUserByUsernameOrEmail(identifier) {
  const id = String(identifier || '').trim()
  if (!id) return null
  const users = await getCollection(COLLECTIONS.USERS)
  // 1) Coincidencia exacta por username.
  let user = await users.findOne({ username: id })
  // 2) Si no, y parece un email, coincidencia case-insensitive por email.
  if (!user && id.includes('@')) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    user = await users.findOne({ email: { $regex: `^${escaped}$`, $options: 'i' } })
  }
  return user
}

export async function verifyUserCredentials(identifier, password) {
  const user = await getUserByUsernameOrEmail(identifier)
  if (!user) return null

  const { valid, needsRehash } = await verifyPassword(password, user.password)
  if (!valid) return null

  // Migración transparente: si el usuario tenía un hash SHA-256 antiguo y la
  // contraseña es correcta, re-hasheamos con bcrypt y guardamos el nuevo hash.
  if (needsRehash) {
    try {
      const users = await getCollection(COLLECTIONS.USERS)
      const newHash = await hashPassword(password)
      await users.updateOne({ id: user.id }, { $set: { password: newHash } })
    } catch (err) {
      // No bloquear el login si el re-hash falla; se reintentará el próximo login.
      console.error('[verifyUserCredentials] re-hash failed:', err?.message || err)
    }
  }

  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}

// Marca que el usuario aceptó los Términos de Uso / Privacidad / Cookies
// (modal de consentimiento). Devuelve el usuario actualizado sin password.
export async function acceptTerms(userId) {
  const users = await getCollection(COLLECTIONS.USERS)
  await users.updateOne({ id: userId }, { $set: { termsAccepted: true, termsAcceptedAt: new Date() } })
  const updated = await users.findOne({ id: userId })
  if (!updated) return null
  const { password: _, ...userWithoutPassword } = updated
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

// `parentId`: comentario RAÍZ al que se cuelga (aplanado a 1 nivel; ya
// resuelto por la ruta antes de llamar aquí). `replyToId`: comentario EXACTO
// al que el usuario respondió (puede ser el mismo que parentId si respondió
// directamente al comentario raíz, o el id de OTRA respuesta si respondió a
// una respuesta). Se guarda por separado porque parentId solo sirve para
// agrupar el hilo plano, mientras que replyToId es el usado por el frontend
// para saber a qué avatar exacto conectar la línea vertical del hilo.
export async function createComment({ postId, userId, text, votedSide = null, parentId = null, replyToId = null }) {
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
    parentId: parentId || null,
    replyToId: replyToId || null,
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

// Cuando un usuario CAMBIA su voto en una publicación, sus comentarios YA
// existentes en esa misma publicación deben reflejar el nuevo lado votado
// (el punto de color en CommentsModal se basa en este campo). Sin esto, el
// comentario quedaba "congelado" con el lado que se había votado en el
// momento de comentar, aunque el usuario cambiara de opción después.
export async function updateCommentsVotedSideForUser(postId, userId, side) {
  if (!postId || !userId || (side !== 'a' && side !== 'b')) return
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  await comments.updateMany(
    { postId, userId },
    { $set: { votedSide: side } }
  )
}

export async function getCommentsByPostId(postId, currentUserId = null) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  const users = await getCollection(COLLECTIONS.USERS)
  
  // Comentarios PRINCIPALES (raíz) ordenados del más ANTIGUO al más RECIENTE
  // (petición explícita del usuario: "el comentario más antiguo tiene que
  // estar primero"). Las respuestas se reordenan aparte en el frontend
  // (repliesByParent, orden ascendente ya existente), así que este orden
  // base ascendente por createdAt es seguro para ambos casos.
  const commentsList = await comments.find({ postId }).sort({ createdAt: 1 }).toArray()

  // Mapa comentario.id -> userId, para poder resolver el AUTOR del comentario
  // AL QUE SE RESPONDIÓ (replyToId) sin hacer una consulta extra por cada
  // comentario. `effectiveReplyToId` cae de vuelta a `parentId` (la raíz del
  // hilo) para respuestas ANTIGUAS creadas antes de que existiera el campo
  // replyToId, para que también muestren "autor ▶ usuario_respondido".
  const commentUserById = new Map(commentsList.map((c) => [c.id, c.userId]))
  const effectiveReplyToId = (c) => c.replyToId || c.parentId || null

  // Recopilar TODOS los userId necesarios (autores + autores respondidos) en
  // una sola consulta batch, evitando el problema N+1 de findOne por comentario.
  const neededUserIds = new Set()
  for (const c of commentsList) {
    if (c.userId) neededUserIds.add(c.userId)
    const targetId = effectiveReplyToId(c)
    const targetUserId = targetId ? commentUserById.get(targetId) : null
    if (targetUserId) neededUserIds.add(targetUserId)
  }
  const userDocs = neededUserIds.size
    ? await users.find({ id: { $in: Array.from(neededUserIds) } }).toArray()
    : []
  const userById = new Map(userDocs.map((u) => [u.id, u]))

  // Enriquecer con datos del autor + datos del usuario al que se respondió
  // (username, usado por el frontend para el formato "autor ▶ usuario", como
  // en apps tipo YouTube/Instagram).
  return commentsList.map((comment) => {
    const author = userById.get(comment.userId) || null
    const targetId = effectiveReplyToId(comment)
    const targetUserId = targetId ? commentUserById.get(targetId) : null
    const replyToAuthor = targetUserId ? userById.get(targetUserId) : null
    return {
      id: comment.id,
      postId: comment.postId,
      text: comment.text,
      votedSide: comment.votedSide || null,
      parentId: comment.parentId || null,
      replyToId: comment.replyToId || null,
      replyToUsername: replyToAuthor?.username || null,
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
}

// Comentario "en crudo" (sin enriquecer), usado para validar que un `parentId`
// pertenece al mismo post al responder, y para saber a quién notificar al
// responder (autor del comentario padre).
export async function getCommentById(commentId) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  return comments.findOne({ id: commentId })
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

// Elimina un comentario si lo pide (a) su propio autor, o (b) el dueño de la
// publicación donde vive (moderación estilo Instagram; `postOwnerId` lo
// resuelve la ruta a partir del post antes de llamar aquí). Si el comentario
// borrado tenía respuestas (era un comentario "padre"), estas se eliminan en
// cascada para no dejar respuestas huérfanas.
export async function deleteComment(commentId, userId, postOwnerId = null) {
  const comments = await getCollection(COLLECTIONS.COMMENTS)
  
  const comment = await comments.findOne({ id: commentId })
  if (!comment) throw new Error('comment_not_found')

  const isAuthor = comment.userId === userId
  const isPostOwner = Boolean(postOwnerId) && postOwnerId === userId
  if (!isAuthor && !isPostOwner) throw new Error('unauthorized')

  await comments.deleteOne({ id: commentId })
  await comments.deleteMany({ parentId: commentId })
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
  } else if (filter === 'comment') {
    query.type = { $in: ['comment', 'reply'] }
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
    text: n.text || (n.type === 'comment' ? `commented: "${n.text}"` : getNotificationText(n.type)),
    time: formatNotificationTime(n.createdAt),
    read: n.read,
    postId: n.postId,
    commentId: n.commentId || null,
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

// Marca como leídas SOLO las notificaciones de ciertos tipos (usado cuando el
// usuario simplemente ABRE una pestaña de categoría -Challenges/Votes/
// Followers/Comments- en la bandeja: por diseño, verlas ya cuenta como
// "leídas" para esa categoría, sin necesidad de pulsar "Mark as read" -que
// queda reservado para la pestaña "All"-).
export async function markNotificationsByTypeAsRead(userId, types) {
  if (!Array.isArray(types) || types.length === 0) return
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  await notifications.updateMany(
    { userId, type: { $in: types }, read: false },
    { $set: { read: true } }
  )
}

export async function getUnreadNotificationsCount(userId) {
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  return await notifications.countDocuments({ userId, read: false })
}


/**
 * Actualiza (o migra) la notificación de voto existente cuando el mismo votante
 * CAMBIA la opción votada en la misma publicación:
 *  - Si el destinatario del nuevo side es el mismo que el del side anterior
 *    (versus normal con un único autor), se actualiza el `side` de la última
 *    notificación de voto de ese votante para ese post y se marca como no leída
 *    con timestamp actual para que suba en la bandeja.
 *  - Si el destinatario cambia (retos con sideA y sideB de autores distintos),
 *    se elimina la notificación al autor anterior y se crea una nueva para el
 *    autor del nuevo side (siempre que no sea el propio votante).
 * Devuelve true si aplicó alguna operación.
 */
export async function updateVoteNotificationOnSwitch({
  postId,
  fromUserId,
  previousSide,
  newSide,
  previousRecipientId,
  newRecipientId,
}) {
  if (!postId || !previousSide || !newSide || previousSide === newSide) return false
  const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
  const voterMatch = fromUserId ? { 'fromUser.id': fromUserId } : { fromUser: null }

  // Mismo destinatario: sólo actualizar side y refrescar timestamp/read.
  if (previousRecipientId && newRecipientId && previousRecipientId === newRecipientId) {
    // findOneAndUpdate con sort para pillar la más reciente.
    const res = await notifications.findOneAndUpdate(
      { userId: previousRecipientId, type: 'vote', postId, ...voterMatch },
      { $set: { side: newSide, read: false, createdAt: new Date() } },
      { sort: { createdAt: -1 }, returnDocument: 'after' }
    )
    return !!res
  }

  // Destinatario distinto: borrar la del autor anterior + crear una nueva para
  // el autor del nuevo side (si aplica y no es el propio votante).
  if (previousRecipientId) {
    await notifications.deleteMany({
      userId: previousRecipientId,
      type: 'vote',
      postId,
      ...voterMatch,
    })
  }
  if (newRecipientId && newRecipientId !== fromUserId && newRecipientId !== 'anonymous') {
    await createNotification({
      userId: newRecipientId,
      type: 'vote',
      fromUserId: fromUserId || null,
      postId,
      side: newSide,
    })
  }
  return true
}

function getNotificationText(type) {
  switch (type) {
    case 'vote': return 'voted on your video in a challenge'
    case 'challenge': return 'challenged you to a battle'
    case 'accepted': return 'accepted your challenge'
    case 'follow': return 'started following you'
    case 'comment': return 'commented on your video'
    case 'reply': return 'replied to your comment'
    default: return 'interacted with you'
  }
}

function formatNotificationTime(date) {
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
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
    // Idempotente: si ya existe una notificación 'follow' de este mismo
    // seguidor hacia este destino, NO creamos otra (evita duplicados al
    // seguir/dejar de seguir repetidamente).
    try {
      const users = await getCollection(COLLECTIONS.USERS)
      const target = await users.findOne({ username: followingUsername })
      if (target && target.id) {
        const notifications = await getCollection(COLLECTIONS.NOTIFICATIONS)
        const dup = await notifications.findOne({ userId: target.id, type: 'follow', 'fromUser.id': followerId })
        if (!dup) {
          await createNotification({ userId: target.id, type: 'follow', fromUserId: followerId })
        }
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

// Devuelve el conjunto (array) de usernames que `followerId` sigue. Útil para
// anotar en bloque el estado isFollowing de muchos autores (p.ej. el feed) con
// UNA sola consulta en lugar de una por autor.
export async function getFollowingUsernames(followerId) {
  if (!followerId) return []
  const follows = await getCollection(COLLECTIONS.FOLLOWS)
  const docs = await follows.find({ followerId }).toArray()
  return docs.map((d) => d.followingUsername).filter(Boolean)
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


/**
 * SUGERENCIAS DE USUARIOS ("personas que quizá conozcas / amigos sugeridos").
 * Combina señales reales:
 *   - Te sigue (y tú no le sigues) -> alta prioridad (posible amistad mutua).
 *   - Ha interactuado contigo (votos/comentarios/retos/seguir) vía notificaciones.
 *   - Os habéis retado (challenges from/to).
 *   - Amigos de amigos: le siguen personas a las que tú sigues.
 *   - Popularidad (nº de seguidores) como desempate / relleno.
 * Excluye a quien ya sigues, a ti mismo y a usuarios suspendidos.
 */
export async function getSuggestedUsers(currentUser, { limit = 40 } = {}) {
  const usersCol = await getCollection(COLLECTIONS.USERS)
  const followsCol = await getCollection(COLLECTIONS.FOLLOWS)

  // Nº de seguidores por username (real, desde la colección de follows).
  const followAgg = await followsCol.aggregate([
    { $match: { followingUsername: { $exists: true, $ne: null } } },
    { $group: { _id: '$followingUsername', count: { $sum: 1 } } },
  ]).toArray()
  const followerCountByUsername = new Map(followAgg.map((d) => [d._id, d.count]))

  const allUsers = await usersCol.find({ suspended: { $ne: true } }).toArray()

  // Invitado: simplemente los más populares.
  if (!currentUser) {
    return allUsers
      .map((u) => ({
        ...publicUserShape(u),
        isFollowing: false,
        followers: followerCountByUsername.get(u.username) || 0,
        reason: 'Popular on Twyk',
      }))
      .sort((a, b) => b.followers - a.followers)
      .slice(0, limit)
  }

  const meId = currentUser.id
  const meName = currentUser.username

  // A quién sigo (usernames) -> excluir.
  const myFollowDocs = await followsCol.find({ followerId: meId }).toArray()
  const iFollow = new Set(myFollowDocs.map((d) => d.followingUsername).filter(Boolean))

  // Quién me sigue (followerIds -> usernames).
  const followerDocs = await followsCol.find({ followingUsername: meName }).toArray()
  const followerIds = followerDocs.map((d) => d.followerId).filter(Boolean)
  const followerUserDocs = followerIds.length
    ? await usersCol.find({ id: { $in: followerIds } }).toArray()
    : []
  const followsMe = new Set(followerUserDocs.map((u) => u.username))

  // Amigos de amigos: a quién siguen las personas que yo sigo.
  const iFollowDocs = iFollow.size
    ? await usersCol.find({ username: { $in: [...iFollow] } }).toArray()
    : []
  const iFollowIds = iFollowDocs.map((u) => u.id)
  const fofDocs = iFollowIds.length
    ? await followsCol.find({ followerId: { $in: iFollowIds } }).toArray()
    : []
  const fofCount = new Map()
  for (const d of fofDocs) {
    const uname = d.followingUsername
    if (!uname) continue
    fofCount.set(uname, (fofCount.get(uname) || 0) + 1)
  }

  // Interacciones contigo (votos/comentarios/retos/seguir) vía notificaciones.
  const notifCol = await getCollection(COLLECTIONS.NOTIFICATIONS)
  const myNotifs = await notifCol.find({ userId: meId }).toArray()
  const interactedIds = new Set(myNotifs.map((n) => n.fromUserId).filter(Boolean))
  const interactedUserDocs = interactedIds.size
    ? await usersCol.find({ id: { $in: [...interactedIds] } }).toArray()
    : []
  const interactedNames = new Set(interactedUserDocs.map((u) => u.username))

  // Retos en los que participo (from/to). Leemos la colección 'challenges'
  // directamente para evitar dependencia circular con lib/stores.js.
  const challengeNames = new Set()
  try {
    const challengesCol = await getCollection('challenges')
    const challenges = await challengesCol.find({}).toArray()
    for (const c of challenges) {
      const fromU = c?.from?.username
      const toU = c?.to?.username
      if (fromU === meName && toU) challengeNames.add(toU)
      if (toU === meName && fromU) challengeNames.add(fromU)
    }
  } catch { /* ignore */ }

  const out = []
  for (const u of allUsers) {
    if (u.username === meName) continue
    if (iFollow.has(u.username)) continue
    const followers = followerCountByUsername.get(u.username) || 0
    let score = 0
    let reason = ''
    if (followsMe.has(u.username)) { score += 60; reason = 'Follows you' }
    if (interactedNames.has(u.username)) { score += 40; if (!reason) reason = 'Interacted with you' }
    if (challengeNames.has(u.username)) { score += 35; if (!reason) reason = 'You challenged each other' }
    const fof = fofCount.get(u.username) || 0
    if (fof > 0) {
      score += fof * 25
      if (!reason) reason = fof === 1 ? 'Followed by someone you follow' : `Followed by ${fof} people you follow`
    }
    score += Math.min(followers, 20) // popularidad (con tope para no dominar)
    if (!reason) reason = followers > 0 ? 'Popular on Twyk' : 'Suggested for you'
    out.push({
      ...publicUserShape(u),
      isFollowing: false,
      followers,
      reason,
      _score: score,
    })
  }
  out.sort((a, b) => (b._score - a._score) || (b.followers - a.followers))
  return out.slice(0, limit).map(({ _score, ...rest }) => rest)
}


/**
 * MODERACIÓN: REPORTES, BLOQUEOS, ROL ADMIN Y SUSPENSIÓN
 */

// Motivos de reporte permitidos (lista por defecto acordada).
export const REPORT_REASONS = [
  'Spam',
  'Inappropriate content',
  'Harassment',
  'Violence',
  'Nudity',
  'False information',
  'Other',
]

// ── REPORTES ─────────────────────────────────────────────────────────────────

export async function createReport({ reporterId, targetType, targetId, reason }) {
  if (targetType !== 'user' && targetType !== 'post') throw new Error('invalid_target_type')
  if (!targetId) throw new Error('invalid_target')
  if (!REPORT_REASONS.includes(reason)) throw new Error('invalid_reason')

  const reports = await getCollection(COLLECTIONS.REPORTS)
  const report = {
    id: generateId(),
    reporterId,
    targetType,   // 'user' | 'post'
    targetId,     // userId o postId
    reason,
    status: 'pending', // 'pending' | 'reviewed' | 'dismissed'
    createdAt: new Date(),
  }
  await reports.insertOne(report)
  return report
}

// Reportes pendientes, enriquecidos con datos del reportante y del objetivo
// (nombre de usuario reportado / autor del post reportado) para el panel admin.
export async function getPendingReports() {
  const reports = await getCollection(COLLECTIONS.REPORTS)
  const users = await getCollection(COLLECTIONS.USERS)
  const posts = await getCollection(COLLECTIONS.POSTS)

  const list = await reports.find({ status: 'pending' }).sort({ createdAt: -1 }).toArray()

  const enriched = await Promise.all(list.map(async (r) => {
    let reporter = null
    if (r.reporterId) {
      const u = await users.findOne({ id: r.reporterId })
      if (u) reporter = { id: u.id, username: u.username, name: u.name || u.username }
    }
    // Resolver el objetivo y a qué usuario afectaría una suspensión.
    let target = null
    let targetUser = null
    if (r.targetType === 'user') {
      const u = await users.findOne({ id: r.targetId })
      if (u) {
        targetUser = { id: u.id, username: u.username, name: u.name || u.username, suspended: !!u.suspended }
        target = { type: 'user', username: u.username }
      } else {
        target = { type: 'user', username: r.targetId }
      }
    } else if (r.targetType === 'post') {
      const p = await posts.findOne({ id: r.targetId })
      const author = p?.author || p?.sideA?.author || null
      target = { type: 'post', postId: r.targetId, author: author ? { username: author.username, name: author.name } : null }
      if (author?.id) {
        const u = await users.findOne({ id: author.id })
        if (u) targetUser = { id: u.id, username: u.username, name: u.name || u.username, suspended: !!u.suspended }
      }
    }
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      reporter,
      target,
      targetUser, // usuario que sería suspendido (null si no se puede resolver)
    }
  }))

  return enriched
}

export async function getReportById(reportId) {
  const reports = await getCollection(COLLECTIONS.REPORTS)
  return reports.findOne({ id: reportId })
}

// Marca un reporte con un nuevo estado ('reviewed' | 'dismissed').
export async function setReportStatus(reportId, status) {
  const reports = await getCollection(COLLECTIONS.REPORTS)
  const res = await reports.updateOne(
    { id: reportId },
    { $set: { status, resolvedAt: new Date() } }
  )
  return res.matchedCount > 0
}

// Determina el usuario afectado por un reporte (para suspender).
export async function resolveReportedUserId(report) {
  if (!report) return null
  if (report.targetType === 'user') return report.targetId
  if (report.targetType === 'post') {
    const posts = await getCollection(COLLECTIONS.POSTS)
    const p = await posts.findOne({ id: report.targetId })
    const author = p?.author || p?.sideA?.author || null
    return author?.id || null
  }
  return null
}

// ── SUSPENSIÓN ───────────────────────────────────────────────────────────────

export async function suspendUser(userId) {
  if (!userId) return false
  const users = await getCollection(COLLECTIONS.USERS)
  const res = await users.updateOne({ id: userId }, { $set: { suspended: true, suspendedAt: new Date() } })
  return res.matchedCount > 0
}

export async function unsuspendUser(userId) {
  if (!userId) return false
  const users = await getCollection(COLLECTIONS.USERS)
  const res = await users.updateOne({ id: userId }, { $set: { suspended: false }, $unset: { suspendedAt: '' } })
  return res.matchedCount > 0
}

// ── BLOQUEOS ─────────────────────────────────────────────────────────────────

export async function blockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId) throw new Error('invalid_block')
  if (blockerId === blockedId) throw new Error('cannot_block_yourself')
  const blocks = await getCollection(COLLECTIONS.BLOCKS)
  const existing = await blocks.findOne({ blockerId, blockedId })
  if (!existing) {
    await blocks.insertOne({ id: generateId(), blockerId, blockedId, createdAt: new Date() })
  }
  return { ok: true, blocked: true }
}

export async function unblockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId) throw new Error('invalid_block')
  const blocks = await getCollection(COLLECTIONS.BLOCKS)
  await blocks.deleteOne({ blockerId, blockedId })
  return { ok: true, blocked: false }
}

// IDs que `userId` ha bloqueado (yo -> a quién bloqueé).
export async function getBlockedIds(userId) {
  if (!userId) return []
  const blocks = await getCollection(COLLECTIONS.BLOCKS)
  const docs = await blocks.find({ blockerId: userId }).toArray()
  return docs.map((d) => d.blockedId)
}

// IDs de quienes han bloqueado a `userId` (quién me bloqueó a mí).
export async function getBlockerIds(userId) {
  if (!userId) return []
  const blocks = await getCollection(COLLECTIONS.BLOCKS)
  const docs = await blocks.find({ blockedId: userId }).toArray()
  return docs.map((d) => d.blockerId)
}

// Conjunto de IDs invisibles para `userId` en ambos sentidos (a quién bloqueé +
// quién me bloqueó). Se usa para ocultar posts en el feed.
export async function getMutualBlockedIds(userId) {
  if (!userId) return new Set()
  const blocks = await getCollection(COLLECTIONS.BLOCKS)
  const docs = await blocks.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).toArray()
  const set = new Set()
  for (const d of docs) {
    set.add(d.blockerId === userId ? d.blockedId : d.blockerId)
  }
  return set
}

// ¿`ownerId` ha bloqueado a `viewerId`? (el bloqueado no puede ver el perfil
// del que lo bloqueó ni comentar en sus posts).
export async function hasBlocked(ownerId, viewerId) {
  if (!ownerId || !viewerId) return false
  const blocks = await getCollection(COLLECTIONS.BLOCKS)
  const doc = await blocks.findOne({ blockerId: ownerId, blockedId: viewerId })
  return !!doc
}
