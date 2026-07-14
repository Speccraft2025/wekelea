# Wekelea — Go-Live Guide (Serverless + Supabase + Daraja + Netlify)

This guide covers everything needed to take Wekelea from local prototype to a live,
production-backed deployment. The architecture after the serverless refactor:

```
┌─────────────────────────────────────────────────────────────┐
│  Netlify (single deploy target)                              │
│                                                             │
│   Next.js frontend  ──►  Next.js API routes (/api/*)        │
│        │                        │                           │
│        │ Supabase Realtime      │ supabase-js (service key) │
│        ▼                        ▼                           │
│   ┌──────────────────── Supabase ─────────────────────┐     │
│   │  Postgres (data)  +  Realtime (live updates)       │    │
│   │  RPC functions enforce atomic escrow money moves   │    │
│   └────────────────────────────────────────────────────┘    │
│                                 ▲                           │
│   Daraja STK Push ──────────────┘ callback → /api/payments/callback │
└─────────────────────────────────────────────────────────────┘
```

There is **no separate backend server** anymore — the Express + Socket.IO backend is
replaced by Next.js API routes and Supabase Realtime.

---

## Part A — Create the Supabase project (~5 min)

1. Go to https://supabase.com → sign in (GitHub login is easiest) → **New project**.
2. Name it `wekelea`, pick a strong database password (save it), choose the region
   closest to Kenya (e.g. **eu-west** / Frankfurt or London).
3. Wait for the project to finish provisioning (~2 min).
4. In the project, open **Project Settings → API** and copy these three values:
   - **Project URL** → e.g. `https://abcdxyz.supabase.co`
   - **anon public** key (starts `eyJ...`)
   - **service_role** key (starts `eyJ...`) — **secret, server-side only**
5. Open **Project Settings → Database → Connection string** and note it exists
   (we won't need the raw connection string if we use supabase-js, but keep it handy).
6. Open the **SQL Editor**, click **New query**, paste the entire contents of
   [`frontend/supabase/schema.sql`](../frontend/supabase/schema.sql), and **Run**.
   This creates all tables, the atomic escrow RPC functions, row-level security
   policies, realtime publication, and the seed data (demo users u1–u4 + admin).

> When you have the three API values, send them to me (or paste into
> `frontend/.env.local` yourself — see Part D). The service_role key is a secret;
> treat it like a password.

---

## Part B — Register a Daraja sandbox app (~10 min)

1. Go to https://developer.safaricom.co.ke → **Log in / Sign up**.
2. Once in the portal, click **My Apps → Add a new app**.
   - Name: `wekelea-sandbox`
   - Tick the **Lipa Na M-Pesa Sandbox** product (and M-Pesa Sandbox).
   - Create.
3. Open the app → copy the **Consumer Key** and **Consumer Secret**.
4. The sandbox **Business Shortcode** is `174379` and the sandbox **Passkey** is the
   public test passkey Safaricom documents:
   `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`
   (already in `.env.example`).
5. **Test credentials / test phone:** the sandbox simulator accepts Safaricom test
   MSISDNs (e.g. `254708374149`). Real STK prompts only reach registered test numbers;
   in the sandbox the STK push is accepted and the callback is fired to your callback URL.
6. **Callback URL:** the STK push needs a public HTTPS callback. Options:
   - **Production/preview:** once deployed, it is `https://<your-netlify-site>/api/payments/callback`.
   - **Local testing:** run an `ngrok http 3000` tunnel and use
     `https://<ngrok-id>.ngrok-free.app/api/payments/callback`.

> Send me the **Consumer Key** and **Consumer Secret** (or add them to `.env.local`).

---

## Part C — GitHub (already done)

The repo is already on GitHub at `github.com/Speccraft2025/wekelea` and `gh` is
authenticated. As the refactor lands I'll commit and push to `master`.

---

## Part D — Environment variables

Create `frontend/.env.local` (gitignored — never committed) with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...            # anon public key (safe in browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ...                # secret — server-side API routes only

# Daraja (M-Pesa) sandbox
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=<your consumer key>
MPESA_CONSUMER_SECRET=<your consumer secret>
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CALLBACK_URL=https://<your-netlify-site>/api/payments/callback
```

The same variables must be set in **Netlify → Site settings → Environment variables**
for the deployed site (Part E).

---

## Part E — Deploy to Netlify

1. From the repo root (Netlify CLI is installed and you're logged in as Spec Media):
   ```bash
   cd frontend
   netlify init          # link to a new site, connect the GitHub repo
   ```
2. Set the env vars from Part D in **Site settings → Environment variables**
   (or via `netlify env:set KEY value`).
3. Deploy:
   ```bash
   netlify deploy --build --prod
   ```
4. Note the live URL, then go back and set `MPESA_CALLBACK_URL` (and Daraja app
   callback if required) to `https://<that-url>/api/payments/callback`, and redeploy.

---

## Part F — Verify live

- Load the site, log in with a phone number, deposit via STK push (sandbox), and walk
  the full escrow happy-path + dispute path.
- Confirm Supabase **Table editor** shows rows changing, and that a second browser tab
  receives live updates (Supabase Realtime).

---

## Checklist

- [ ] Supabase project created; `schema.sql` run successfully
- [ ] Supabase URL + anon + service_role keys collected
- [ ] Daraja sandbox app created; consumer key/secret collected
- [ ] `frontend/.env.local` populated
- [ ] Netlify site linked; env vars set
- [ ] Deployed; callback URL pointed at the live site
- [ ] End-to-end verified live
