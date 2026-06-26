import Link from 'next/link'
import { ArrowLeft, ScrollText } from 'lucide-react'

export const metadata = {
  title: 'Términos de Uso — Twyk',
  description: 'Términos de Uso de Twyk, la plataforma de retos de vídeo A/B.',
}

const UPDATED = '26 de junio de 2025'

export default function TermsPage() {
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Volver a Twyk
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <ScrollText className="w-7 h-7 text-white" strokeWidth={1.6} />
          <h1 className="text-2xl font-bold tracking-tight">Términos de Uso</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">Última actualización: {UPDATED}</p>

        <div className="space-y-7 text-[15px] leading-relaxed text-white/75">
          <section>
            <h2 className="text-white font-semibold text-lg mb-2">1. Qué es Twyk</h2>
            <p>
              Twyk es una plataforma de <strong>retos de vídeo A/B</strong> en formato VS de pantalla
              dividida (split-screen). Los usuarios suben vídeos cortos enfrentados (Lado A vs Lado B),
              retan a otros usuarios y la comunidad vota por su favorito. Al usar Twyk aceptas estos
              Términos de Uso en su totalidad. Si no estás de acuerdo, no utilices la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">2. Edad mínima (COPPA)</h2>
            <p>
              Debes tener <strong>al menos 13 años</strong> para crear una cuenta o usar Twyk. Twyk no
              está dirigida a menores de 13 años y no recopilamos conscientemente sus datos, de acuerdo
              con la Children&apos;s Online Privacy Protection Act (COPPA) de los Estados Unidos. Si
              descubrimos que una cuenta pertenece a un menor de 13 años, la eliminaremos.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">3. Tu contenido y licencia</h2>
            <p>
              Conservas la titularidad de los vídeos, comentarios y demás contenido generado por el
              usuario (UGC) que publicas en Twyk. No obstante, al subir contenido nos concedes una
              <strong> licencia no exclusiva, mundial, libre de regalías (gratuita) y transferible</strong> para
              alojar, almacenar, reproducir, mostrar, distribuir, adaptar el formato y promocionar tu
              contenido dentro de Twyk y en materiales promocionales de la plataforma. Esta licencia
              existe únicamente para operar y promocionar el servicio y finaliza cuando eliminas tu
              contenido, salvo copias en caché o respaldos razonables.
            </p>
            <p className="mt-3">
              Declaras que posees todos los derechos necesarios sobre el contenido que subes y que este
              no infringe derechos de terceros (incluidos derechos de autor, marcas, privacidad o
              imagen).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">4. Conducta y contenido prohibido</h2>
            <p>Está prohibido publicar o difundir en Twyk contenido que:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Sea violento, gráfico o promueva daño o autolesión.</li>
              <li>Sea sexual, pornográfico o muestre desnudez explícita.</li>
              <li>Constituya acoso, intimidación, amenazas o discurso de odio.</li>
              <li>Sea spam, fraudulento, engañoso o publicidad no autorizada.</li>
              <li>Infrinja derechos de autor o de propiedad intelectual de terceros.</li>
              <li>Suplante la identidad de otra persona o entidad.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">5. Suspensión y terminación</h2>
            <p>
              Twyk puede <strong>suspender o eliminar cuentas</strong> que violen estos Términos, las
              normas de la comunidad o la ley aplicable, con o sin previo aviso. Las cuentas suspendidas
              no pueden iniciar sesión y su contenido puede ocultarse del feed. También aplicamos una
              política de terminación de cuentas reincidentes en infracciones de derechos de autor
              (consulta nuestra <Link href="/dmca" className="underline text-white/90 hover:text-white">Política DMCA</Link>).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">6. Moderación y reportes</h2>
            <p>
              Los usuarios pueden reportar contenido o perfiles que incumplan estas normas y bloquear a
              otros usuarios. Nuestro equipo revisa los reportes y puede tomar medidas, incluida la
              suspensión de la cuenta infractora.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">7. Exención de garantías</h2>
            <p>
              Twyk se proporciona &quot;tal cual&quot; y &quot;según disponibilidad&quot;, sin garantías de ningún tipo.
              No garantizamos que el servicio sea ininterrumpido o libre de errores. En la máxima medida
              permitida por la ley, Twyk no será responsable de daños indirectos o incidentales
              derivados del uso de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">8. Ley aplicable</h2>
            <p>
              Estos Términos se rigen por las leyes del <strong>Estado de Delaware, Estados Unidos</strong>,
              sin atender a sus normas de conflicto de leyes. Cualquier disputa se someterá a los
              tribunales competentes del Estado de Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">9. Contacto</h2>
            <p>
              Para cualquier consulta sobre estos Términos, escríbenos a{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-white/50 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-white">Política de Privacidad</Link>
          <Link href="/dmca" className="hover:text-white">Política DMCA</Link>
        </div>
      </div>
    </div>
  )
}
