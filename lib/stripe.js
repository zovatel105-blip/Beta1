// lib/stripe.js
//
// Suscripción de pago para el editor de fotos con IA usando GEMINI (Nano
// Banana) — petición explícita del usuario: "quiero que agregues Gemini
// pero los usuarios tendran que pagar para poder usar ese editor
// individualmente" + "como larpgpt" (suscripción mensual por niveles, no
// pago único por uso) + "Agnes gratuita, Gemini pago".
//
// 3 planes mensuales en USD: Starter $5/50, Pro $10/120, Premium $20/300
// ediciones con Gemini). Los IDs de precio reales de Stripe (creados una sola
// vez con scripts/stripe-setup.mjs) viven en variables de entorno — NUNCA
// hardcodeados aquí, para poder recrearlos sin tocar código si el .env se
// pierde (ver memory/ENV_BACKUP.md).
import Stripe from 'stripe'

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

// credits: null = ilimitado (nunca se descuenta, ver consumeAiCredit en lib/db.js).
// Actualizado a petición del usuario: montos en USD (antes EUR) y créditos
// 50/120/300 (antes 5/20/ilimitado) — el 3er plan pasó de "Unlimited" a
// "Premium" con tope de 300 créditos/mes (ya no ilimitado de verdad).
export const AI_PLANS = [
  { key: 'starter', priceEnvVar: 'STRIPE_PRICE_STARTER', label: 'Starter', amount: 5, credits: 50 },
  { key: 'pro', priceEnvVar: 'STRIPE_PRICE_PRO', label: 'Pro', amount: 10, credits: 120 },
  { key: 'premium', priceEnvVar: 'STRIPE_PRICE_PREMIUM', label: 'Premium', amount: 20, credits: 300 },
]

export function planPriceId(plan) {
  return process.env[plan.priceEnvVar] || null
}

export function getPlanByKey(key) {
  return AI_PLANS.find((p) => p.key === key) || null
}

export function getPlanByPriceId(priceId) {
  if (!priceId) return null
  return AI_PLANS.find((p) => planPriceId(p) === priceId) || null
}
