import { API_BASE_URL } from '../config/env';
import { FeedPage, Post } from '../types';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
  return (await res.json()) as T;
}

// Solo publicaciones de votación (1vs1 / versus) entran al feed.
export async function fetchUploads(): Promise<Post[]> {
  try {
    const data = await getJson<{ posts: Post[] }>('/api/uploads');
    return (data.posts || []).filter((p) => p.type === 'duet' || p.type === 'versus');
  } catch {
    return [];
  }
}

export async function fetchFeedPage(cursor: number, limit = 8): Promise<FeedPage> {
  return getJson<FeedPage>(`/api/feed?cursor=${cursor}&limit=${limit}`);
}

export async function sendVote(
  id: string,
  side: 'a' | 'b'
): Promise<{ votes?: { a: number; b: number } }> {
  const res = await fetch(`${API_BASE_URL}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, side }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en /api/vote`);
  return res.json();
}
