<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Sello Pricing Tool

React/TypeScript e-commerce analytics dashboard for Sello UK.

## Local setup

Prerequisites:
- Node.js
- npm

1. Install dependencies:
   `npm install`
2. Install repo git hooks:
   `npm run hooks:install`
3. Copy [.env.example](.env.example) to `.env.local` and fill in the values you need.
4. Start the app:
   `npm run dev`

## Environment variables

Client build/runtime:
- `API_KEY`
- `VITE_API_KEY`

Netlify/database functions:
- `NETLIFY_DATABASE_URL`
- `NETLIFY_DATABASE_URL_UNPOOLED`
- `ADMIN_PASSWORD_HASH`

Notes:
- The Vite config accepts either `API_KEY` or `VITE_API_KEY` for the client build.
- Database sync/push features require the Netlify function environment variables.
- `.env`, `.env.local`, and environment-specific `.env.*` files stay untracked; use `.env.example` as the portable template.
