# Deploy to Render for free

One free Render web service serves the whole app at `https://<name>.onrender.com`: the API, and
the built web app from the same address, so cookies and the voice socket need no extra setup. The
database is a free Neon Postgres (it has `pgvector` and `pg_trgm`). AI runs on the Mock, so the
demo costs nothing.

## What to expect

Measured locally with Render's free limits (512 MB of memory, 0.1 CPU) on the same image:

|                         |                                          |
| ----------------------- | ---------------------------------------- |
| Memory in use           | about 100 MB of 512 MB                   |
| Start after a wake-up   | about 40 s, on top of Render's own start |
| Log in                  | about 1.3 s                              |
| A page or a script file | under 0.1 s                              |

- The service **sleeps after 15 minutes** without visitors. The next visit wakes it, which takes
  about a minute and a half in total.
- **Every start resets the demo data** (`SEED_ON_START=always`): each reviewer gets a clean library
  with the two demo accounts, and nothing anyone changed or registered survives a wake-up.
- **Voice is off**. The offline voice answers a fixed script whatever is said, which would mislead
  a visitor; the real one needs Amazon Nova 2 Sonic credentials.

## Steps

1. **Push the repository to GitHub.** `render.yaml` at the root describes the service.
2. **Create the database** at [neon.tech](https://neon.tech) (free plan):
   - Create a project in **AWS Europe Central (Frankfurt)**, the same region as the service.
   - Under Connect, turn **Connection pooling off** and copy the connection string. Migrations need
     a direct connection. It ends in `?sslmode=require`; keep that.
3. **Create the service** at [render.com](https://render.com):
   - Click [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AbbassJaber/library-monorepo),
     or New → **Blueprint** → pick the repository. Render reads `render.yaml`.
   - When it asks for `DATABASE_URL`, paste the Neon connection string. The two secrets
     (`JWT_ACCESS_SECRET`, `AI_CONFIRM_SECRET`) are generated for you.
   - Apply. The first build takes several minutes.
4. **Open** `https://library-demo.onrender.com` (if the name is taken, change `name` in
   `render.yaml`) and log in as `reader@library.local` or `librarian@library.local`, password
   `Password123!`.

Pushes to the default branch redeploy automatically (`autoDeploy`).

## Changing the defaults

Set these in the service's Environment tab on Render:

| Want                       | Set                                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep data between wake-ups | `SEED_ON_START=if-empty` (visitors' changes then stay, including a librarian's edits)                                                                                                                                              |
| Never sleep                | a free uptime monitor calling `/health` every 10 minutes; one service running all month fits the free 750 hours, but nothing resets then                                                                                           |
| Real AI                    | the `AI_PROVIDER`, model and AWS variables from [guide.md](guide.md), with an AWS budget alert. Measured costs: about $0.007 per chat message ([evaluation.md](evaluation.md)); anyone can register, and the per-user limits apply |

## How it works

[`deploy/render/Dockerfile`](../deploy/render/Dockerfile) builds the API and the web app, then
keeps the API's dependencies with the Prisma CLI. [`start.sh`](../deploy/render/start.sh) runs on
every start: it applies migrations only when
[`migrations-up-to-date.mjs`](../deploy/render/migrations-up-to-date.mjs) finds one not yet in
Prisma's `_prisma_migrations` table (starting the Prisma CLI alone takes about 40 s on 0.1 CPU),
seeds, and starts the API with `WEB_DIST_DIR` set, which makes it serve the web app. The public
address Render provides (`RENDER_EXTERNAL_URL`) becomes the allowed browser origin. The local
Compose stack and its images are unchanged.

Try the image locally first:

```sh
docker build -f deploy/render/Dockerfile -t library-render .
docker run --rm -p 10000:10000 --memory=512m --cpus=0.1 \
  -e PORT=10000 -e DATABASE_URL='<a Postgres 17 with pgvector>' \
  -e JWT_ACCESS_SECRET="$(openssl rand -base64 32)" -e AI_CONFIRM_SECRET="$(openssl rand -base64 32)" \
  -e COOKIE_SECURE=true -e SEED_ON_START=always -e BCRYPT_ROUNDS=10 \
  -e RENDER_EXTERNAL_URL=http://localhost:10000 library-render
```
