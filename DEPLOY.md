# Deploy Enterprise Knowledge Bot (Vercel)

This app matches the reference layout at [enterprise-bot-mu.vercel.app](https://enterprise-bot-mu.vercel.app): Next.js chat + Supabase RAG.

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run `database/schema.sql` in the SQL editor.
3. Run `database/migrations/002_enterprise_features.sql` if present.
4. Create a **Storage** bucket named `documents` (private).
5. Enable **Email** auth (or your preferred provider) under Authentication.

Copy from **Project Settings → API**:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never expose to client)

## 2. Environment variables

Copy `.env.example` to `.env.local` for local dev. In Vercel, add the same variables under **Settings → Environment Variables**:

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `OPENAI_API_KEY` | Yes |
| `NEXT_PUBLIC_SITE_URL` | Yes (e.g. `https://your-app.vercel.app`) |

## 3. Deploy to Vercel

```bash
cd EnterpriseKnowledgeBot
npx vercel
```

Or connect the repo in the Vercel dashboard:

- **Root directory:** `EnterpriseKnowledgeBot` (if monorepo)
- **Framework:** Next.js
- **Build command:** `npm run build`
- **Install command:** `npm install`

After first deploy, set `NEXT_PUBLIC_SITE_URL` to your production URL and redeploy.

## 4. Post-deploy checks

1. Sign up / log in at `/login`.
2. Open `/chat` — knowledge console on the left (xl screens).
3. Upload a PDF or TXT, or use **Sync Directory** (syncs local `documents/` on the server; on Vercel, prefer upload UI).
4. Ask a question grounded in the uploaded doc.

## 5. Admin features

Set a user's `role` to `admin` in the `users` table to unlock:

- Clear Knowledge Base (danger zone)
- Admin Center (`/admin`)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Note:** Folder sync reads `documents/` on the machine running Next.js. On Vercel, use **Ingest Document** in the chat console instead.
