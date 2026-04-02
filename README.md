---
title: Medusa M-Pesa Backend
emoji: 📦
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# Medusa M-Pesa Backend

A Medusa v2 commerce backend with a custom M-Pesa (Safaricom Daraja API) payment provider integration. Deployed on Hugging Face Spaces via Docker.

## Features

- **M-Pesa STK Push**: Full Lipa Na M-Pesa Online (LNMO) payment flow
- **Daraja Callbacks**: C2B, reversal, and timeout webhook handlers
- **Admin UI Extensions**: Custom transaction management routes and widgets
- **Reconciliation Jobs**: Automated payment reconciliation and timeout handling
- **Fraud Review**: Risk scoring and manual review workflow

## API

The backend is accessible at `https://<user>-<space-name>.hf.space`.

Health check: `GET /health`

## Required Environment Variables

Set these in your Hugging Face Space **Settings → Variables and Secrets**:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon.tech PostgreSQL connection string (with `?sslmode=require`) |
| `REDIS_URL` | Upstash Redis connection string (e.g., `rediss://...`) |
| `JWT_SECRET` | Random long string |
| `COOKIE_SECRET` | Random long string |
| `STORE_CORS` | Your storefront URL (e.g., `https://your-store.vercel.app`) |
| `ADMIN_CORS` | Your admin URL |
| `AUTH_CORS` | Your auth domain URL |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja consumer key |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja consumer secret |
| `MPESA_PASSKEY` | Safaricom STK Push passkey |
| `MPESA_SHORTCODE` | Safaricom business shortcode |
| `MPESA_CALLBACK_BASE_URL` | Public URL of this HF Space |
| `MPESA_ENV` | `sandbox` or `production` |
