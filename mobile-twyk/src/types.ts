export type Author = {
  username?: string;
  name?: string;
  avatarUrl?: string;
};

export type Side = {
  videoUrl?: string;
  posterUrl?: string;
  author?: Author;
  description?: string;
  music?: string;
  qualities?: Array<{ h: number; url: string; bitrate: number }>;
};

export type Post = {
  id: string;
  type: 'versus' | 'duet' | string;
  layout?: 'horizontal' | 'vertical' | 'carousel' | string;
  sideA?: Side;
  sideB?: Side;
  votes?: { a: number; b: number };
  isChallenge?: boolean;
  description?: string;
  author?: Author;
  stats?: { comments?: number; shares?: number; saves?: number };
};

export type FeedPage = {
  posts: Post[];
  nextCursor: number;
  hasMore: boolean;
};
