'use client'

import { useState } from 'react'
import DateWheelPicker from '@/components/DateWheelPicker'

export default function DevDatePage() {
  const [val, setVal] = useState('')
  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col items-center pt-10 px-6">
      <h1 className="text-[26px] font-extrabold tracking-tight">What&apos;s your date of birth?</h1>
      <p className="text-zinc-500 text-[14px] mt-2 mb-7">Your date of birth won&apos;t be shown publicly.</p>
      <div className="w-full max-w-[420px]">
        <DateWheelPicker value={val} onChange={setVal} />
      </div>
      <p className="mt-6 text-zinc-700" data-testid="val">value: {val}</p>
    </div>
  )
}
