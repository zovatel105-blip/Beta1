// Server Component (sin 'use client'): este page.tsx no necesita estado ni
// interactividad propia; toda la lógica de cliente vive en VotingFeed.
import VotingFeed from '@/components/voting/VotingFeed'

export const metadata = {
  title: 'Battle — Duelos A/B de alto rendimiento',
  description: 'Feed vertical de votación con scroll-snap nativo y fluidez 60/120fps.',
}

const BattlePage = () => {
  return <VotingFeed />
}

export default BattlePage
