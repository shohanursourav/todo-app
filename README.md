# Shared To-Do 📝

A simple **shared** to-do web app built with **Next.js (App Router) + Tailwind CSS**, persisted in a free **Upstash Redis** database via [`@upstash/redis`](https://www.npmjs.com/package/@upstash/redis).

Every visitor shares **one list** — add a task on your phone, check it off on your laptop. The list auto-refreshes every 5 seconds, and a status badge shows whether data is in the **Cloud** (Upstash Redis) or **Local** (your browser's localStorage) when the Upstash keys are not configured.

## Features

- ➕ Add tasks (Enter or the Add button)
- ✅ Tick to mark done / untick to mark active
- ✏️ Edit in place (double-click a task, or hover → pencil icon; Enter saves, Esc cancels)
- 🗑️ Delete a task (hover → × icon)
- 🔎 Filters: **All / Active / Completed**
- 🧹 **Clear completed** in one click
- 🔗 **Share** button copies the link to the clipboard
- ☁️ Cloud persistence with **Upstash Redis** (survives reloads, new tabs, and other devices)
- 💾 **Local fallback** to `localStorage` (with cross-tab sync) when the Upstash env keys are missing
- 🏷️ **Cloud / Local status badge** so you always know where data lives
- 🔄 **Auto-refresh** of the list every 5 seconds
- 🌗 Light + dark mode

## Getting started (local)

```bash
npm install

# Optional — cloud mode. Skip this to run in local mode.
cp .env.example .env.local
# then fill in your real UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

npm run dev
```

Open http://localhost:3000.

- **With** Upstash keys → the badge shows **Cloud**, all mutations go through the API routes and are stored in Redis under the key `todo:tasks`.
- **Without** keys → the badge shows **Local**, the app persists to `localStorage` instead (survives reloads and syncs across tabs of the same browser).

### API

| Method | Route              | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | `/api/tasks`       | List tasks (`{ source, tasks }`)         |
| POST   | `/api/tasks`       | Add a task — body `{ "text": "…" }`      |
| PATCH  | `/api/tasks/:id`   | Update — body `{ "text"?, "completed"? }`|
| DELETE | `/api/tasks/:id`   | Delete a task                            |
| POST   | `/api/tasks/clear` | Delete all completed tasks               |

## Deploy for free (Vercel + Upstash)

### 1. Create a free Upstash Redis database

1. Sign up at [upstash.com](https://upstash.com) (free tier is plenty).
2. In the console, create a new **Redis** database (pick any region).
3. Open **Settings → REST API** (or the "How to connect" panel) and copy the **REST URL** and **REST Token**.

### 2. Deploy on Vercel

1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and **Import** the repo.
3. Keep the defaults (Framework Preset: **Next.js**, output stays on the App Router).
4. **Important:** set the project name to `todo` in the project settings. Vercel gives every project a `*.vercel.app` subdomain named after the project, so a project named `todo` gets **`https://todo.vercel.app`** — *if that name is still available*. (If it's taken, Vercel will assign the next free subdomain, e.g. `todo-abc123.vercel.app`; you can also claim your own domain in Domains settings.)
5. Under **Environment Variables**, add:
   - `UPSTASH_REDIS_REST_URL` → your REST URL
   - `UPSTASH_REDIS_REST_TOKEN` → your REST token
6. Click **Deploy**. A few seconds later your shared to-do list is live. 🎉

> Tip: you can also install the Vercel CLI (`npm i -g vercel`) and run `vercel` in this folder to deploy from the terminal.

### 3. Share it

Hit the **Share** button in the app (or copy the URL) — anyone opening that link sees the same list, and changes made by anyone appear for everyone within ~5 seconds.

## How it works

- **`src/app/page.tsx`** — client component holding all UI state. On load it calls `GET /api/tasks`, which reports where tasks are stored (`source: "cloud" | "local"`):
  - **Cloud**: all reads/writes go through the API routes, which read/write a single JSON blob in Upstash Redis (key `todo:tasks`) using `@upstash/redis`.
  - **Local**: the browser's `localStorage` is the source of truth; a `storage` event listener keeps multiple tabs in sync.
- Mutations are applied **optimistically**, then confirmed by the API (or persisted locally), with rollback on failure.
- A `setInterval` polls the source of truth **every 5 seconds** so every open tab/device converges on the latest list.
- **`src/lib/store.ts`** — the only place that talks to Redis; returns `null` when credentials are missing so routes can fall back cleanly.

## Environment variables

| Variable                    | Required | Description                       |
| --------------------------- | -------- | --------------------------------- |
| `UPSTASH_REDIS_REST_URL`    | No*      | Upstash REST endpoint URL         |
| `UPSTASH_REDIS_REST_TOKEN`  | No*      | Upstash REST API token            |

\* Only needed for cloud mode. Without both keys the app runs in local mode automatically.

See [`.env.example`](.env.example) for a template.

## Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `npm run dev`     | Start the dev server       |
| `npm run build`   | Production build           |
| `npm run start`   | Serve the production build |
| `npm run lint`    | Run ESLint                 |
