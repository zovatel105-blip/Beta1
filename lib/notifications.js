// Notificaciones simuladas para la página de notificaciones general (Bandeja).
// Tipos: vote (alguien votó), challenge (te han retado), accepted (aceptaron tu reto),
//        follow (nuevo seguidor), comment (comentario).
export const MOCK_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'challenge',
    user: { username: 'urbanlife', name: 'Marco Ruiz', avatarUrl: 'https://i.pravatar.cc/120?img=12' },
    text: 'te ha retado a una batalla',
    time: 'hace 5 min',
    read: false,
  },
  {
    id: 'n2',
    type: 'vote',
    user: { username: 'dancepro', name: 'Nina León', avatarUrl: 'https://i.pravatar.cc/120?img=49' },
    text: 'votó tu vídeo en un reto',
    time: 'hace 22 min',
    read: false,
  },
  {
    id: 'n3',
    type: 'accepted',
    user: { username: 'oceanvibes', name: 'Lía Mar', avatarUrl: 'https://i.pravatar.cc/120?img=32' },
    text: 'aceptó tu reto 🥊',
    time: 'hace 1 h',
    read: false,
  },
  {
    id: 'n4',
    type: 'follow',
    user: { username: 'fitfreak', name: 'Diego Torres', avatarUrl: 'https://i.pravatar.cc/120?img=15' },
    text: 'empezó a seguirte',
    time: 'hace 3 h',
    read: true,
  },
  {
    id: 'n5',
    type: 'comment',
    user: { username: 'foodie', name: 'Carla Gómez', avatarUrl: 'https://i.pravatar.cc/120?img=20' },
    text: 'comentó: "¡Qué nivel! 🔥"',
    time: 'hace 6 h',
    read: true,
  },
  {
    id: 'n6',
    type: 'vote',
    user: { username: 'wanderlust', name: 'Sofía Vela', avatarUrl: 'https://i.pravatar.cc/120?img=47' },
    text: 'votó tu vídeo en un reto',
    time: 'ayer',
    read: true,
  },
]

export const notificationsUnreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length
