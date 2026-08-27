// Script ÚNICO (se ejecuta una sola vez) para crear en Stripe los 3 planes
// del editor de IA con Gemini (Starter/Pro/Unlimited, estilo LarpGPT) y el
// endpoint de webhook apuntando a este backend — así el usuario no tiene que
// tocar el panel de Stripe a mano. Imprime los IDs a pegar en /app/.env.
import Stripe from 'stripe'
import fs from 'fs'

let STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
let BASE_URL = process.env.NEXT_PUBLIC_BASE_URL
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m1 = env.match(/STRIPE_SECRET_KEY=(.*)/)
  if (m1) STRIPE_SECRET_KEY = m1[1].trim()
  const m2 = env.match(/NEXT_PUBLIC_BASE_URL=(.*)/)
  if (m2) BASE_URL = m2[1].trim()
} catch {}

if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing')
if (!BASE_URL) throw new Error('NEXT_PUBLIC_BASE_URL missing')

const stripe = new Stripe(STRIPE_SECRET_KEY)

async function main() {
  const plans = [
    { key: 'STARTER', name: 'Twyk AI Editor — Starter', amount: 500, credits: 5 },
    { key: 'PRO', name: 'Twyk AI Editor — Pro', amount: 1000, credits: 20 },
    { key: 'UNLIMITED', name: 'Twyk AI Editor — Unlimited', amount: 2000, credits: null },
  ]

  const priceIds = {}
  for (const plan of plans) {
    const price = await stripe.prices.create({
      currency: 'eur',
      unit_amount: plan.amount,
      recurring: { interval: 'month' },
      product_data: { name: plan.name },
      metadata: { credits: plan.credits === null ? 'unlimited' : String(plan.credits) },
    })
    priceIds[plan.key] = price.id
    console.log(`Precio creado (${plan.key}): ${price.id} (product ${price.product})`)
  }

  const webhookUrl = `${BASE_URL.replace(/\/$/, '')}/api/stripe/webhook`
  // Si ya existe un webhook con esta misma URL (re-ejecución del script), lo
  // reutiliza en vez de crear uno duplicado.
  const existing = await stripe.webhookEndpoints.list({ limit: 100 })
  let endpoint = existing.data.find((w) => w.url === webhookUrl)
  if (endpoint) {
    console.log(`Webhook ya existía (${endpoint.id}) — no se puede volver a leer su secret; bórralo en el dashboard de Stripe y vuelve a correr este script si necesitas el secret de nuevo.`)
  } else {
    endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
      ],
    })
    console.log(`Webhook creado: ${endpoint.id} -> ${webhookUrl}`)
    console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`)
  }

  console.log('\n--- Pegar en /app/.env ---')
  console.log(`STRIPE_PRICE_STARTER=${priceIds.STARTER}`)
  console.log(`STRIPE_PRICE_PRO=${priceIds.PRO}`)
  console.log(`STRIPE_PRICE_UNLIMITED=${priceIds.UNLIMITED}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
