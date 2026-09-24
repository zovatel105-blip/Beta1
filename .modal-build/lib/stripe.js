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

// ─────────────────────────────────────────────────────────────────────────
// CARTERA (Wallet) — moneda virtual NUEVA, separada de los planes de arriba
// (AI_PLANS = suscripción mensual del editor de IA). Petición del usuario:
// "cartera con creditos en el menu de los ajustes del perfil", para dar
// propina a otros creadores. Pago ÚNICO (no suscripción) vía Stripe
// Checkout `mode:'payment'` (ver handleWalletCheckout/route.js).
//
// Precios pensados a propósito para ser MÁS BARATOS que las monedas de
// TikTok (investigado: ~$0.0106-$0.0152 por moneda en EE.UU., ej. 65
// monedas=$0.99, 660=$9.99, 1321=$19.99) — aquí el precio por crédito es
// ~40-60% más bajo, usando los mismos precios "redondos" ya conocidos
// (0.99/4.99/9.99/19.99) — petición explícita: "ajustalos para que sean
// mas accesibles que los de TikTok y otras plataformas".
export const WALLET_PACKAGES = [
  { key: 'small', priceEnvVar: 'STRIPE_PRICE_WALLET_SMALL', label: '150 credits', amount: 99, credits: 150 },
  { key: 'medium', priceEnvVar: 'STRIPE_PRICE_WALLET_MEDIUM', label: '800 credits', amount: 499, credits: 800 },
  { key: 'large', priceEnvVar: 'STRIPE_PRICE_WALLET_LARGE', label: '2000 credits', amount: 999, credits: 2000 },
  { key: 'mega', priceEnvVar: 'STRIPE_PRICE_WALLET_MEGA', label: '5000 credits', amount: 1999, credits: 5000 },
]

export function walletPackagePriceId(pkg) {
  return process.env[pkg.priceEnvVar] || null
}

export function getWalletPackageByKey(key) {
  return WALLET_PACKAGES.find((p) => p.key === key) || null
}

export function getWalletPackageByPriceId(priceId) {
  if (!priceId) return null
  return WALLET_PACKAGES.find((p) => walletPackagePriceId(p) === priceId) || null
}
