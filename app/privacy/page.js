import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Twyk',
  description: 'Twyk Privacy Policy. COPPA and CalOPPA compliant.',
}

const UPDATED = 'June 26, 2025'

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Twyk
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-7 h-7 text-white" strokeWidth={1.6} />
          <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">Last updated: {UPDATED}</p>

        <div className="space-y-7 text-[15px] leading-relaxed text-white/75">
          <section>
            <p>
              This Privacy Policy explains how Twyk, the A/B video challenge platform
              (split-screen VS), collects, uses and protects your information. We comply with the
              U.S. Children&apos;s Online Privacy Protection Act (<strong>COPPA</strong>) and with the California
              Online Privacy Protection Act (<strong>CalOPPA</strong>).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">1. Data we collect</h2>
            <p>To provide Twyk we collect only the data we need:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Email</strong> — for your account and essential communications.</li>
              <li><strong>Username</strong> — your public identity on the platform.</li>
              <li><strong>Date of birth</strong> — to verify the minimum age of 13 (COPPA).</li>
              <li><strong>Uploaded videos</strong> — the content you publish in your challenges.</li>
              <li><strong>Votes</strong> — your A/B choices in challenges.</li>
              <li><strong>Comments</strong> — the text you post on publications.</li>
              <li><strong>IP address (approximate country only)</strong> — used briefly, server-side, to show trending content relevant to your region.</li>
            </ul>
            <p className="mt-3">
              We do not collect precise (GPS) geolocation data, payment information or biometric data.
              We do use your IP address to estimate an <strong>approximate country-level location</strong> only,
              so the &quot;Trending Challenge&quot; shown to you reflects what is currently trending in your
              region. This lookup is performed server-side, is not tied to your account identity, and your
              IP address is not stored long-term.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">2. How we store your data</h2>
            <p>
              Your data is stored in a <strong>MongoDB</strong> database hosted on
              <strong> servers located in the United States</strong>. Passwords are stored
              encrypted (hashed with bcrypt) and never in plain text.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">3. How we use your data</h2>
            <p>
              We use your data exclusively to operate Twyk: to authenticate you, show your content and
              your challenges, count votes, send in-app notifications and apply community moderation.
              <strong> We do not sell or rent your data to third parties.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">4. Children&apos;s privacy (COPPA)</h2>
            <p>
              Twyk is not directed to children under 13 and <strong>we do not knowingly collect data
              from children under 13</strong>. During registration we verify age using the date of
              birth and block anyone who does not meet the minimum age. If you believe a child under 13
              has provided us data, contact us and we will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">5. Cookies</h2>
            <p>
              We use <strong>essential cookies only</strong>, necessary to keep your session signed in
              and remember your basic preferences. We do not use advertising or third-party tracking
              cookies.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">6. Your rights and data requests</h2>
            <p>
              You can request to access, correct or delete your personal data at any time.
              To exercise these rights (including the rights granted by CalOPPA to California
              residents), write to us at{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>.
              We will respond to your request within a reasonable time.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">7. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will post the current version on
              this page with its update date.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">8. Contact</h2>
            <p>
              For any privacy questions or data requests, contact us at{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-white/50 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className="hover:text-white">Terms of Use</Link>
          <Link href="/dmca" className="hover:text-white">DMCA Policy</Link>
        </div>
      </div>
    </div>
  )
}
