'use client'

import dynamic from 'next/dynamic'

const Feed = dynamic(() => import('@/components/Feed'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-[100dvh] bg-black flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  ),
})

export default function Page() {
  return <Feed />
}
