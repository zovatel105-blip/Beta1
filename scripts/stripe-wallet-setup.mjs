// Script ÚNICO (se ejecuta una sola vez) para crear en Stripe los 4
// paquetes de créditos de la Cartera (pago ÚNICO, no suscripción — a
// diferencia de los planes del editor de IA, ver stripe-setup.mjs).
// Imprime los IDs de precio a pegar en /app/.env.
import Stripe from 'stripe'
import fs from 'fs'

let STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m1 = env.match(/STRIPE_SECRET_KEY=(.*)/)
  if (m1) STRIPE_SECRET_KEY = m1[1].trim()
} catch {}

if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing')

const stripe = new Stripe(STRIPE_SECRET_KEY)

async function main() {
  // Mismos valores que WALLET_PACKAGES en lib/stripe.js.
  const packages = [
    { key: 'SMALL', name: 'Twyk Wallet — 150 credits', amount: 99, credits: 150 },
    { key: 'MEDIUM', name: 'Twyk Wallet — 800 credits', amount: 499, credits: 800 },
    { key: 'LARGE', name: 'Twyk Wallet — 2000 credits', amount: 999, credits: 2000 },
    { key: 'MEGA', name: 'Twyk Wallet — 5000 credits', amount: 1999, credits: 5000 },
  ]

  const priceIds = {}
  for (const pkg of packages) {
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: pkg.amount,
      product_data: { name: pkg.name },
      metadata: { credits: String(pkg.credits) },
    })
    priceIds[pkg.key] = price.id
    console.log(`Precio creado (${pkg.key}): ${price.id} (product ${price.product})`)
  }

  console.log('\n--- Pegar en /app/.env ---')
  console.log(`STRIPE_PRICE_WALLET_SMALL=${priceIds.SMALL}`)
  console.log(`STRIPE_PRICE_WALLET_MEDIUM=${priceIds.MEDIUM}`)
  console.log(`STRIPE_PRICE_WALLET_LARGE=${priceIds.LARGE}`)
  console.log(`STRIPE_PRICE_WALLET_MEGA=${priceIds.MEGA}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
