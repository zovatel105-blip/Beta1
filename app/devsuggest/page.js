'use client'

import SuggestedUsersPage from '@/components/SuggestedUsersPage'

export default function DevSuggestPage() {
  return (
    <SuggestedUsersPage
      open={true}
      onClose={() => {}}
      onOpenProfile={() => {}}
      onChallenge={() => {}}
      onRequireAuth={() => {}}
    />
  )
}
