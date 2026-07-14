# CLAUDE.md — Wekelea Escrow Platform: Full Implementation Handoff

> This file is picked up automatically by Claude Code when you run `claude` inside this project directory.
> It is the single source of truth for architecture, current state, and implementation tasks.

---

## What Is Wekelea?

**Wekelea** (Swahili: *"to bet/stake"*) is a **peer-to-peer social escrow contract platform** built for the Kenyan market. Users make real social agreements (sports predictions, debates, challenges), both parties lock KES stakes into a secure escrow vault via M-Pesa STK Push, and funds auto-release to the winner upon mutual settlement or admin arbitration.

**Legal Position**: NOT a sportsbook, gambling platform, or betting house. No odds generated. No house bets. Dual-consent P2P escrow only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Socket.io-client, Three.js |
| Backend | Node.js, Express, TypeScript, Socket.io |
| Database | Local JSON file with async mutex lock (ready to swap to Prisma + PostgreSQL) |
| Payments | Simulated Safaricom M-Pesa Daraja STK Push (webhook callback pattern) |
| Real-time | Socket.IO room-based event broadcasting |
| Deployment | Docker Compose monorepo |

---

## Project Structure

```
wekelea/
├── CLAUDE.md
├── .env
├── .env.example
├── docker-compose.yml
├── package.json                  # Root scripts: install:all, dev, build, start
│
├── backend/                      # Node.js Express API (Port 5001)
│   └── src/
│       ├── index.ts              # Express + Socket.IO server entry point
│       ├── types/index.ts        # All TypeScript interfaces
│       ├── db/
│       │   ├── db.ts             # Database class with async mutex, CRUD, seed data
│       │   └── database.json     # Persisted JSON flat-file database
│       ├── routes/
│       │   └── api.ts            # All REST API route handlers + Socket.IO emitters
│       └── services/
│           ├── escrow.ts         # Core escrow state machine
│           └── mpesa.ts          # M-Pesa STK Push simulation
│
└── frontend/                     # Next.js 14 PWA (Port 3000)
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── globals.css        # Design system: CSS vars, glassmorphism, animations
        │   └── page.tsx           # ENTIRE APP - 1920 lines, all screens conditional
        ├── components/
        │   └── ThreeDSplashScreen.tsx   # Three.js GLB 3D logo splash (2.8s)
        └── services/
            └── api.ts             # WekeleaAPI: typed fetch wrappers for all endpoints
```

---

## Development Setup

```bash
# Install all dependencies (root + backend + frontend)
npm run install:all

# Start both servers concurrently
npm run dev
# Backend: http://localhost:5001
# Frontend: http://localhost:3000

# Optional: Docker
docker-compose up --build
```

---

## Database Architecture

The database is a **JSON flat-file** (`backend/src/db/database.json`) managed by the `Database` class in `backend/src/db/db.ts`.

### Mutex Locking
All reads/writes go through an async `Lock` queue to prevent race conditions and double-spends. NEVER bypass the `Database` class with direct `fs.readFileSync` calls.

### Pre-Seeded Users

| id | username | phone | walletBalance |
|---|---|---|---|
| u1 | MwangiEscrow | 254712345678 | 4500 KES |
| u2 | Mwende_Vibe | 254723456789 | 7800 KES |
| u3 | Achieng_Dev | 254734567890 | 1200 KES |
| u4 | Kip_Runner | 254745678901 | 15000 KES |
| admin | WekeleaAdmin | 254700000000 | 100000 KES |

### Schema Types (defined in `backend/src/types/index.ts`)
- `User` — id, phone, username, avatar, trustScore, contractsCompleted, winStreak, walletBalance
- `Contract` — id, title, category, terms, termsList, stakeAmount, totalPot, creatorId, counterpartyId, creatorStatus, counterpartyStatus, status, eventDate, settlementDeadline, expirationDate, trustedSource, trashTalk, privacy, winnerId, claimedById, disputeId
- `Notification` — id, userId, title, message, contractId, type, read
- `Transaction` — id, userId, amount, type (DEPOSIT/WITHDRAW/LOCK/UNLOCK/FEE), status, reference, description
- `Dispute` — id, contractId, openedById, reason, evidenceLink, status (OPEN/RESOLVED/REFUNDED), resolutionDetails, resolvedById
- `EscrowLedger` — detailed per-entry ledger
- `AuditLog` — immutable logs of every state change

---

## Contract State Machine

```
DRAFT -> AWAITING_ACCEPTANCE -> AWAITING_FUNDING -> ACTIVE -> CLAIMED -> SETTLED
                                                                      -> DISPUTED -> SETTLED (admin win)
                                                                                 -> REFUNDED (admin split)
```

### State Transitions

| Action | Endpoint | Handler | Effect |
|---|---|---|---|
| Create | POST /api/contracts | api.ts | Creates contract, notifies counterparty |
| Accept Terms | POST /api/contracts/:id/accept | EscrowService.acceptContract() | AWAITING_ACCEPTANCE -> AWAITING_FUNDING |
| Fund/Lock | POST /api/contracts/:id/fund | EscrowService.lockStake() | Deducts wallet. Both funded -> ACTIVE |
| Claim Win | POST /api/contracts/:id/claim | EscrowService.claimWin() | ACTIVE -> CLAIMED |
| Approve Settlement | POST /api/contracts/:id/settle | EscrowService.approveSettlement() | Pays pot minus 5% fee -> SETTLED |
| Dispute | POST /api/contracts/:id/dispute | EscrowService.disputeClaim() | CLAIMED -> DISPUTED |
| Admin: Settle | POST /api/disputes/:id/resolve | EscrowService.adminResolveDispute() | DISPUTED -> SETTLED |
| Admin: Refund | POST /api/disputes/:id/refund | EscrowService.adminRefundDispute() | DISPUTED -> REFUNDED |

### Platform Fee
- All settlements: **5% of total pot** deducted
- Fee credited to admin wallet (id: 'admin')
- On dispute refund: no fee collected — full stakes returned

---

## M-Pesa Simulation Flow

1. **UI triggers**: WekeleaAPI.initiateSTKPush() -> POST /api/payments/stkpush
   - Creates a PENDING transaction with CheckoutRequestID as reference
2. **Frontend shows**: Safaricom M-Pesa STK PIN prompt overlay (3.5s delay simulation)
3. **User confirms PIN**: Frontend calls triggerCallback(CheckoutRequestID, true) -> POST /api/payments/callback
   - Finds PENDING transaction, marks SUCCESS, credits wallet
   - Emits balance_updated and mpesa_payment_completed socket events
4. **Frontend auto-funds**: WekeleaAPI.fundContract() -> EscrowService.lockStake()

> **Production swap**: Replace MpesaService.initiateSTKPush() with real Daraja API. All surrounding logic stays the same.

---

## Socket.IO Events

### Rooms
| Room | Purpose |
|---|---|
| user_room_{userId} | Personal notifications, balance updates |
| contract_room_{contractId} | Live contract state changes |
| admin_room | Dispute alerts to admin |
| global_feed | Public contract creation broadcast |

### Events Emitted by Backend
| Event | Payload | Trigger |
|---|---|---|
| notification_received | { title, contractId } | Any contract action affecting user |
| balance_updated | { balance } | Wallet credit/debit |
| mpesa_payment_completed | { success, amount } | STK callback processed |
| contract_updated | full Contract object | Any contract state change |
| contract_created | full Contract object | New public contract |
| dispute_opened | { contractId, disputeId } | Dispute filed |
| dispute_resolved | full Dispute object | Admin arbitrates |
| system_reset | { message } | Database reset |

---

## Frontend Architecture

### Single-Page Application Pattern
The entire frontend is in one file: `frontend/src/app/page.tsx` (1920 lines).
All screens are rendered conditionally based on `currentView` state:

| currentView | Screen |
|---|---|
| 'landing' | Public landing page |
| 'dashboard' | User contract dashboard (tabs: active/pending/completed) |
| 'create-contract' | Contract creation form |
| 'wallet' | Wallet balance, withdraw, transaction history |
| 'admin' | Admin dispute moderation (only when currentUser.id === 'admin') |

### Design System (globals.css)
- Colors: Brand orange #EC7505, Golden #E89005, Danger red #E70E02, BG #0d0d0f
- Fonts: Outfit (headings) + Inter (body)
- Glassmorphism: .glass, .glass-premium, .glass-interactive
- Animations: vault-glow pulse on ACTIVE contracts
- Kenyan flag accent strip: .kenya-accent gradient

### Key UI Elements (all inline in page.tsx)
- Demo Panel (fixed bottom-right): role switcher + reset button — always visible
- Notification Banner (fixed top): 5s auto-dismiss
- Splash Screen: ThreeDSplashScreen.tsx with Three.js GLB model
- Login Modal: phone -> OTP (any 4 digits) -> auto-login
- Share Modal: invite link, WhatsApp URL, QR placeholder
- M-Pesa STK Overlay: Safaricom UI simulation
- Dispute Modal: reason text input

### Polling Fallback
Frontend polls every 4s (setInterval) as backup alongside Socket.IO.

---

## Authentication

Fully simulated — no real JWT validation:
- POST /api/auth/login: looks up user by phone (formats to 254...), creates new user if not found
- POST /api/auth/verify-otp: accepts any code, returns user
- Token format: `simulated_jwt_token_for_{userId}` (not validated server-side)
- Session stored in localStorage as `wekelea_user` JSON

**Demo login**: Phone `0712345678` -> any 4-digit OTP -> logs in as MwangiEscrow

---

## Demo Guide

### Happy Path (Consensual Settlement)
1. Login as Mwangi (phone 0712345678, OTP 1234)
2. Create Challenge: Sports, stake KES 2000, opponent Mwende_Vibe
3. Switch to Mwende via Demo Panel -> accept challenge (AWAITING_FUNDING)
4. Mwende: Pay via M-Pesa STK -> confirm PIN -> funded
5. Switch to Mwangi: fund contract -> both funded -> ACTIVE
6. Mwangi: Claim Win
7. Switch to Mwende: Consent & Settle -> SETTLED
8. Mwangi receives KES 3,800 (4000 - 5% fee = 200)

### Dispute Path
1. Follow steps 1-6 above
2. Mwende: Reject & Dispute -> type reason -> DISPUTED
3. Switch to Admin -> Admin Console shows dispute
4. Admin types resolution notes -> settle for one party OR refund both

---

## Known Issues & Bugs

### CRITICAL — Fix First
1. **`page.tsx` line 1** has a spurious `'use html';` directive before `'use client';` — remove it immediately. This may cause build failures.
2. **Admin resolve buttons are hardcoded** to u1 and u2 (`handleAdminResolve(dispute.id, 'u1')`). They must dynamically use the actual contract's creatorId/counterpartyId.

### Minor
3. No auth middleware — any userId in request body is trusted (acceptable for MVP)
4. mpesa_payment_completed socket event has no dedicated frontend listener — frontend relies on fundContract() call immediately after
5. QR Code in Share Modal is a placeholder — not implemented
6. NEXT_PUBLIC_BACKEND_URL not set in frontend/.env.local — relies on hostname pattern / localhost fallback

---

## Implementation Tasks (Priority Order)

### P0 - Bug Fixes (DONE — 2026-07-13)
- [x] Remove `'use html';` from page.tsx line 1
- [x] Fix hardcoded admin resolve buttons to use actual contract creatorId/counterpartyId (now fetches each dispute's contract + a users map; buttons show real usernames, are disabled until data loads, and call `handleAdminResolve` with the real party IDs)
- [x] Verify frontend builds: `cd frontend && npm run build` — passes (warnings only)
- [x] Verify backend builds: `cd backend && npm run build` — passes
- [x] End-to-end smoke test via API: happy path (create→accept→fund→claim→settle) and dispute path (dispute→admin resolve) both verified; wallet math and 5% fee correct

### P1 - Core Feature Completion (DONE — 2026-07-13)
- [x] QR Code in Share Modal: `qrcode.react@^4.2.0` installed; `QRCodeSVG` renders a real scannable QR of the invite URL with the Wekelea logo excavated in the center (verified in browser)
- [x] WhatsApp share button: already implemented — opens `https://wa.me/?text=...` with the invite link
- [x] Contract URL deep-linking: `?contractId=` captured on mount; opens the contract once authenticated (prompts login first if logged out), then strips the query param. Verified both logged-out→login→open and logged-in→open paths
- [x] Admin panel dynamic winners: done in P0 — buttons resolve to the real contract creator/counterparty with their usernames
- [x] Terms of Service / Privacy Policy / Responsible Use: top-level `legalModal` with real stub content for all three, reachable from the landing footer pre-login
- [x] Landing page public contracts feed: replaced the dev "Branding Setup" box with a live "Open Challenges" feed (Public + joinable statuses); clicking a card prompts login and deep-links into that contract

### P2 - UX Enhancements
- [ ] Stake slider with quick-pick presets (KES 500, 1000, 2000, 5000)
- [ ] Contract expiry countdown timer using expirationDate field
- [ ] Notification badge count on Bell icon
- [ ] Replace window.confirm() dialogs with custom glass modals
- [ ] Replace alert() calls with toast/snackbar system (e.g. react-hot-toast)
- [ ] Empty states for empty contract lists
- [ ] Transaction history pagination
- [ ] PWA manifest: ensure public/manifest.json exists with Wekelea branding

### P3 - Architecture & Refactor
- [ ] Split page.tsx (1920 lines) into separate component files:
  - LandingPage.tsx, Dashboard.tsx, ContractCard.tsx, ContractDetail.tsx
  - CreateContract.tsx, WalletView.tsx, AdminPanel.tsx
  - modals/LoginModal.tsx, MpesaPromptModal.tsx, ShareModal.tsx, DisputeModal.tsx
- [ ] JWT auth middleware: validate Bearer token header on protected routes
- [ ] Prisma + PostgreSQL migration:
  - `npm install prisma @prisma/client --save --prefix backend`
  - Create backend/prisma/schema.prisma matching existing types
  - Replace Database class with Prisma client calls
  - DATABASE_URL already set in .env.example
- [ ] Rate limiting on /api/auth/login and payment endpoints
- [ ] Input validation with zod or express-validator

### P4 - Production Readiness
- [ ] Real M-Pesa Daraja integration:
  - OAuth: https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
  - STK: https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
  - Real callback URL via ngrok in dev
  - Env vars already in .env.example
- [ ] CORS lockdown: replace origin: '*' with specific frontend domain
- [ ] Add helmet.js for HTTP security headers
- [ ] Replace console.log with structured logger (winston or pino)
- [ ] Connect Docker Compose postgres service to backend
- [ ] GitHub Actions CI/CD: lint, type-check, build on push

---

## API Reference

### Auth
- POST /api/auth/login — body: { phone }
- POST /api/auth/verify-otp — body: { phone, code }

### Users
- GET /api/users
- GET /api/users/:id — lookup by id, phone, OR username
- GET /api/users/:id/transactions
- GET /api/users/:id/notifications
- POST /api/users/:id/notifications/read
- POST /api/users/:id/withdraw — body: { amount }

### Contracts
- GET /api/contracts — public OR ?userId=u1 for user's contracts
- GET /api/contracts/:id
- POST /api/contracts
- POST /api/contracts/:id/accept — body: { userId }
- POST /api/contracts/:id/fund — body: { userId }
- POST /api/contracts/:id/claim — body: { userId }
- POST /api/contracts/:id/settle — body: { userId }
- POST /api/contracts/:id/dispute — body: { userId, reason }

### Payments
- POST /api/payments/stkpush — body: { phone, amount, contractId, userId }
- POST /api/payments/callback — body: { checkoutRequestId, success: boolean }

### Admin / Disputes
- GET /api/disputes
- POST /api/disputes/:id/resolve — body: { winnerId, notes }
- POST /api/disputes/:id/refund — body: { notes }

### System
- POST /api/system/reset — reseeds DB to initial state

---

## Brand Assets

Located in frontend/public/assets/:
- logo.png — Main logo (104 KB)
- favicon.ico — Browser favicon (4 KB)
- wekelea 3d logo.glb — 3D GLB model for Three.js splash screen

Brand colors:
- Primary Orange: #EC7505
- Golden Yellow: #E89005
- Brand Red: #E70E02
- Background: #0d0d0f
- Card BG: #141417

---

## Start Here

1. Read this file (done)
2. Fix P0 bugs first — especially the 'use html'; directive and hardcoded admin buttons
3. Verify both servers build and run: `npm run install:all && npm run dev`
4. Open http://localhost:3000 and walk through the full demo flow
5. Work through tasks in priority order: P0 -> P1 -> P2 -> P3 -> P4

The codebase is feature-complete at MVP level. All core escrow flows, socket events, M-Pesa simulation, and admin panel are implemented. The P0 bugs are the only thing blocking a clean run. Everything else is polish, refactoring, and production hardening.

---
Generated by Antigravity AI — July 2026
