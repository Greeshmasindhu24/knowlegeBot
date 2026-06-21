This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Local embeddings with Ollama (no OpenAI billing)

If OpenAI quota is exceeded or you want fully local document ingestion:

1. Install [Ollama](https://ollama.com) and pull models:
   ```bash
   ollama pull nomic-embed-text
   ollama pull llama3.2
   ```
2. Ensure Ollama is running (`ollama serve` or the desktop app).
3. In `.env.local`:
   ```env
   LLM_PROVIDER=ollama
   EMBEDDING_DIMENSIONS=768
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_EMBEDDING_MODEL=nomic-embed-text
   OLLAMA_MODEL=llama3.2
   ```
4. In Supabase SQL Editor, run `database/migrations/004_ollama_768_embeddings.sql` (clears existing chunk vectors; re-upload documents after).
5. Restart the dev server and retry upload.

Verify setup: `npm run diag:upload`

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
