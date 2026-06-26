'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Copyright, Send } from 'lucide-react'

const UPDATED = 'June 26, 2025'

export default function DmcaPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    description: '',
    url: '',
    goodFaith: false,
  })

  const valid =
    form.name.trim() &&
    form.email.trim() &&
    form.description.trim() &&
    form.url.trim() &&
    form.goodFaith

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    const subject = encodeURIComponent('DMCA Infringement Notice — Twyk')
    const body = encodeURIComponent(
      `Rights holder name: ${form.name}\n` +
      `Contact email: ${form.email}\n\n` +
      `Description of the infringed protected content:\n${form.description}\n\n` +
      `URL of the infringing content on Twyk:\n${form.url}\n\n` +
      `Good faith statement: The complainant states, in good faith, that the use of the described material ` +
      `is not authorized by the rights holder, its agent or the law, and that the information in ` +
      `this notice is accurate. Under penalty of perjury, the complainant is authorized to act ` +
      `on behalf of the rights holder.`
    )
    window.location.href = `mailto:twyk.apk@gmail.com?subject=${subject}&body=${body}`
  }

  const inputCls =
    'w-full bg-white/5 text-white placeholder:text-white/30 px-4 py-3 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/10 focus:border-white/25'

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Twyk
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Copyright className="w-7 h-7 text-white" strokeWidth={1.6} />
          <h1 className="text-2xl font-bold tracking-tight">DMCA Policy</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">Last updated: {UPDATED}</p>

        <div className="space-y-7 text-[15px] leading-relaxed text-white/75">
          <section>
            <p>
              Twyk respects intellectual property rights and responds to infringement notices in
              accordance with the U.S. Digital Millennium Copyright Act (<strong>DMCA</strong>).
              If you believe a video or other content posted on Twyk infringes your
              copyright, send us a notice using the form below.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">How to report an infringement</h2>
            <p>
              A valid DMCA notice must include: your name, a contact email, a description of the
              protected content that has been infringed, the exact URL of the infringing content on
              Twyk and a good faith statement. Complete all fields in the form and an email addressed
              to our DMCA agent will be generated.
            </p>
          </section>

          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-zinc-900/60 border border-white/10 p-5">
            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your full name"
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">Contact email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@email.com"
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">Description of the infringed content</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the copyrighted work that has been infringed"
                rows={3}
                className={inputCls + ' resize-y'}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">URL of the content on Twyk</label>
              <input
                type="text"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://twyk.app/?post=..."
                className={inputCls}
                required
              />
            </div>

            <label className="flex items-start gap-3 text-[13px] text-white/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.goodFaith}
                onChange={(e) => setForm({ ...form, goodFaith: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-white"
                required
              />
              <span>
                I declare, in good faith and under penalty of perjury, that the use of the described
                content is not authorized by the rights holder, its agent or the law, and that the
                information provided is accurate.
              </span>
            </label>

            <button
              type="submit"
              disabled={!valid}
              className={
                'w-full py-3.5 rounded-xl font-semibold text-[14px] transition-all flex items-center justify-center gap-2 ' +
                (valid ? 'bg-white text-black hover:bg-white/90 active:scale-[0.98]' : 'bg-white/15 text-white/40 cursor-not-allowed')
              }
            >
              <Send className="w-4 h-4" /> Send DMCA notice
            </button>
            <p className="text-white/40 text-[11px] text-center">
              Your email client will open with the notice addressed to twyk.apk@gmail.com
            </p>
          </form>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Repeat infringers</h2>
            <p>
              Twyk applies a <strong>repeat infringer termination policy</strong>: users who
              repeatedly infringe the copyright of others will have their account
              permanently suspended or deleted.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Counter-notice</h2>
            <p>
              If your content was removed by mistake, you can send a counter-notice to{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>{' '}
              explaining why the material does not infringe copyright.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-white/50 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className="hover:text-white">Terms of Use</Link>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
