import { useCallback, useState } from 'react';
import { sendVote } from '../api/client';

// ───────────────────────────────────────────────────────────────────────────
// VIEW POOLING — ESTADO POR-PUBLICACIÓN FUERA DE LAS VISTAS.
//
// FlashList RECICLA las tarjetas: el MISMO componente <VersusCard /> se reutiliza
// para publicaciones distintas a medida que deslizas (igual que un RecyclerView
// de Android / UICollectionView de iOS). Si el estado (votos, voto, guardado)
// viviera DENTRO de la tarjeta con `useState`, al reciclarse mostraría datos
// "contaminados" de la publicación anterior.
//
// SOLUCIÓN: guardamos todo el estado mutable en un mapa keyed por `post.id` que
// vive en el feed (FUERA de las celdas). Las tarjetas son PRESENTACIONALES:
// reciben sus datos por props y nunca pierden ni mezclan estado al reciclarse.
// ───────────────────────────────────────────────────────────────────────────

export type Votes = { a: number; b: number };
export type Interaction = { votes: Votes; userVote: 'a' | 'b' | null; saved: boolean };
export type InteractionMap = Record<string, Interaction>;

const EMPTY: Interaction = { votes: { a: 0, b: 0 }, userVote: null, saved: false };

// Devuelve la interacción de una publicación (o un valor base si aún no existe).
export function resolveInteraction(map: InteractionMap, id: string, baseVotes?: Votes): Interaction {
  return map[id] ?? { ...EMPTY, votes: baseVotes ?? { a: 0, b: 0 } };
}

export function useFeedInteractions() {
  const [byId, setById] = useState<InteractionMap>({});

  const vote = useCallback((id: string, side: 'a' | 'b', baseVotes: Votes) => {
    setById((prev) => {
      const cur = prev[id] ?? { ...EMPTY, votes: baseVotes };
      if (cur.userVote) return prev; // ya votó esta publicación
      // Optimista: refleja el voto al instante.
      return {
        ...prev,
        [id]: {
          ...cur,
          userVote: side,
          votes: { ...cur.votes, [side]: (cur.votes[side] || 0) + 1 },
        },
      };
    });
    // Reconciliación con el backend (mismo /api/vote que la web).
    sendVote(id, side)
      .then((data) => {
        if (data?.votes) {
          setById((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? EMPTY), votes: data.votes! },
          }));
        }
      })
      .catch(() => {
        /* se mantiene el conteo optimista */
      });
  }, []);

  const toggleSave = useCallback((id: string, baseVotes: Votes) => {
    setById((prev) => {
      const cur = prev[id] ?? { ...EMPTY, votes: baseVotes };
      return { ...prev, [id]: { ...cur, saved: !cur.saved } };
    });
  }, []);

  return { byId, vote, toggleSave };
}
