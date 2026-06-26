import Link from 'next/link'
import { ArrowLeft, ScrollText } from 'lucide-react'

export const metadata = {
  title: 'Terms of Use — Twyk',
  description: 'Twyk Terms of Use, the A/B video challenge platform.',
}

const UPDATED = 'June 26, 2025'

export default function TermsPage() {
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Twyk
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <ScrollText className="w-7 h-7 text-white" strokeWidth={1.6} />
          <h1 className="text-2xl font-bold tracking-tight">Terms of Use</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">Last updated: {UPDATED}</p>

        <div className="space-y-7 text-[15px] leading-relaxed text-white/75">
          <section>
            <h2 className="text-white font-semibold text-lg mb-2">1. What Twyk is</h2>
            <p>
              Twyk is an <strong>A/B video challenge</strong> platform in a split-screen VS format.
              Users upload short videos head to head (Side A vs Side B), challenge other users and the
              community votes for their favorite. By using Twyk you accept these Terms of Use in full.
              If you do not agree, do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">2. Minimum age (COPPA)</h2>
            <p>
              You must be <strong>at least 13 years old</strong> to create an account or use Twyk. Twyk
              is not directed to children under 13 and we do not knowingly collect their data, in
              accordance with the U.S. Children&apos;s Online Privacy Protection Act (COPPA). If we learn
              that an account belongs to a child under 13, we will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">3. Your content and license</h2>
            <p>
              You retain ownership of the videos, comments and other user-generated content (UGC) you
              post on Twyk. However, by uploading content you grant us a
              <strong> non-exclusive, worldwide, royalty-free (free) and transferable license</strong> to
              host, store, reproduce, display, distribute, adapt the format of and promote your content
              within Twyk and in the platform&apos;s promotional materials. This license exists solely to
              operate and promote the service and ends when you delete your content, except for
              reasonable cached copies or backups.
            </p>
            <p className="mt-3">
              You represent that you own all rights necessary to the content you upload and that it does
              not infringe the rights of any third party (including copyright, trademark, privacy or
              likeness rights).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">4. Conduct and prohibited content</h2>
            <p>It is prohibited to post or share content on Twyk that:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Is violent, graphic or promotes harm or self-harm.</li>
              <li>Is sexual, pornographic or shows explicit nudity.</li>
              <li>Constitutes harassment, intimidation, threats or hate speech.</li>
              <li>Is spam, fraudulent, deceptive or unauthorized advertising.</li>
              <li>Infringes the copyright or intellectual property rights of third parties.</li>
              <li>Impersonates another person or entity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">5. Suspension and termination</h2>
            <p>
              Twyk may <strong>suspend or delete accounts</strong> that violate these Terms, the
              community guidelines or applicable law, with or without prior notice. Suspended accounts
              cannot sign in and their content may be hidden from the feed. We also apply a repeat
              copyright infringer termination policy
              (see our <Link href="/dmca" className="underline text-white/90 hover:text-white">DMCA Policy</Link>).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">6. Moderation and reports</h2>
            <p>
              Users can report content or profiles that break these rules and block other users. Our
              team reviews reports and may take action, including suspending the infringing account.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">7. Disclaimer of warranties</h2>
            <p>
              Twyk is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind.
              We do not guarantee that the service will be uninterrupted or error-free. To the maximum
              extent permitted by law, Twyk will not be liable for indirect or incidental damages arising
              from the use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">8. Governing law</h2>
            <p>
              These Terms are governed by the laws of the <strong>State of Delaware, United States</strong>,
              without regard to its conflict of laws rules. Any dispute will be submitted to the
              competent courts of the State of Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">9. Contact</h2>
            <p>
              For any questions about these Terms, write to us at{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-white/50 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/dmca" className="hover:text-white">DMCA Policy</Link>
        </div>
      </div>
    </div>
  )
}
