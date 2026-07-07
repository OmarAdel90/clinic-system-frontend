# Clinic System Frontend

Next.js frontend for the Clinic System backend. This app is designed as a modern SaaS-style CRM and operations workspace for clinics, call center agents, inventory teams, and administrators.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Standalone frontend repo intended to be pulled on Hostinger

## Local Development

```bash
npm install
npm run dev
```

Create a local `.env` from `.env.example` and point it at the backend API:

```env
NEXT_PUBLIC_API_BASE_URL=https://undergrow.online/clinic-backend/api
```

## Current Scope

This first version includes:

- Login flow against the Laravel `/login` endpoint
- Token-backed workspace shell
- Dashboard overview
- Live data pages for leads, visits, invoices, clinics, warehouses, suppliers, campaigns, pharmaceuticals, users, and roles

## Production Flow

1. Push frontend changes to this repo
2. Pull the repo on Hostinger
3. Build/start the frontend according to your hosting setup

## Backend Dependency

This frontend expects the Laravel backend to provide:

- Sanctum token auth
- JSON API at `/api`
- CORS support for the deployed frontend origin
