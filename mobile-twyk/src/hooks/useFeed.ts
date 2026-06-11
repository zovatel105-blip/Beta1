import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeedPage, fetchUploads } from '../api/client';
import { Post } from '../types';

// Misma estrategia que la web: carga inicial /api/uploads + 1ª pagina de
// /api/feed en paralelo; loadMore pagina /api/feed (scroll infinito); dedupe por id.
export function useFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [ready, setReady] = useState(false);

  const cursorRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  const appendUnique = useCallback((incoming: Post[]) => {
    const fresh: Post[] = [];
    for (const p of incoming || []) {
      if (p && p.id && !seenRef.current.has(p.id)) {
        seenRef.current.add(p.id);
        fresh.push(p);
      }
    }
    if (fresh.length) setPosts((prev) => [...prev, ...fresh]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [uploads, page] = await Promise.all([
        fetchUploads(),
        fetchFeedPage(0).catch(() => ({ posts: [], nextCursor: 0, hasMore: false })),
      ]);
      if (cancelled) return;
      cursorRef.current = page.nextCursor ?? 0;
      hasMoreRef.current = page.hasMore !== false;
      const merged: Post[] = [];
      for (const p of [...uploads, ...(page.posts || [])]) {
        if (p && p.id && !seenRef.current.has(p.id)) {
          seenRef.current.add(p.id);
          merged.push(p);
        }
      }
      setPosts(merged);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    try {
      const page = await fetchFeedPage(cursorRef.current);
      cursorRef.current = page.nextCursor ?? cursorRef.current;
      hasMoreRef.current = page.hasMore !== false;
      appendUnique(page.posts || []);
    } catch {
      /* reintento en el siguiente cruce de umbral */
    } finally {
      loadingRef.current = false;
    }
  }, [appendUnique]);

  return { posts, ready, loadMore };
}
