# Wekelea 🔒 Peer-to-Peer Social Escrow Contract Platform

> "Put your money where your mouth is." Settle social arguments instantly and securely with conditional escrow contracts funded via M-Pesa STK Push.

Wekelea is a fast, mobile-first **peer-to-peer social escrow contract platform** optimized for Kenyan payment habits. 

---

### ⚠️ Legal Compliance & Position Positioning
Wekelea is **NOT** a sportsbook, sportsbook helper, gambling platform, casino, odds engine, or house-betting system. 
- The platform **does NOT** generate odds.
- The platform **does NOT** act as a betting counterparty or house.
- The platform **does NOT** determine event outcomes or winners automatically.
- All agreements are peer-to-peer, initiated and funded by consenting users around objectively verifiable parameters, requiring dual-consent mutual settlement or admin arbitration.

---

## 🚀 Key Architectural Features
1. **P2P Escrow Vaults**: Consenting users create challenges with matching KES stakes. Funds are locked into independent secure vault ledgers.
2. **Simulated M-Pesa Daraja Integration**: Features a realistic mock simulation of Safaricom STK Push lipa-na-m-pesa prompt alerts directly in the client. User PIN confirmation triggers automated background callback webhooks that credit wallets and activate contract escrows.
3. **Double-Spend & ACID Transactional Integrity**: Features synchronized thread-safe state transition mutex locking on JSON/PostgreSQL tables. Ensures user balances cannot be double-spent, locks are immutable, and payouts are only released once.
4. **Real-time Socket Synchronization**: Integrated Socket.IO pipeline syncing active contract pages, system notification centers, and client wallets instantly.
5. **5% Platform Transaction Fee**: Escrow payout settlements deduct a standard 5% platform service fee, routing it to the system treasury wallet automatically.
6. **Modular Dispute Moderation Console**: Fully fledged admin dashboard to review, freeze, manually arbitrate, or split-refund disputed escrows with resolution logging.

---

## 🛠 Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Socket.io-client.
- **Backend**: Node.js, Express, TypeScript, Socket.io, Dotenv.
- **Database**: Extensible local database schema (pre-seeded for out-of-the-box local developer demo evaluation; ready for immediate Prisma PostgreSQL swap).
- **Deployment**: Dockerized monorepo with Compose automation.

---

## 📁 Monorepo Folder Structure
```
wekelea/
├── frontend/             # Next.js 14 App Client (Port 3000)
│   ├── src/app/          # PWA Screen layouts, styles, and page panels
│   ├── src/services/     # WekeleaAPI routing controller & WebSocket listener
│   └── Dockerfile        # Next.js container build config
│
├── backend/              # Node Express API & Socket.io Engine (Port 5001)
│   ├── src/db/           # Mutex locked local Database service & seed data
│   ├── src/routes/       # User, Transaction, Contract, STK, & Admin routes
│   ├── src/services/     # M-Pesa Daraja SIM & Escrow state transition processors
│   ├── src/types/        # Full typescript schema definitions
│   └── Dockerfile        # Express service container build config
│
├── docker-compose.yml    # Coordinates container stack (Frontend, Backend, Postgres)
├── package.json          # Root scripts coordinate concurrently dev environments
└── .env.example          # Template environment configurations
```

---

## ⚡️ Quick Local Startup

Get the entire frontend, backend API, and real-time socket server running locally in under two minutes.

### Prerequisites
- Node.js (v18+)
- npm

### Step 1: Install Dependencies
From the root directory, run the automated workspace installer:
```sh
npm run install:all
```

### Step 2: Start Development Servers
Start both the Express API (Port 5001) and Next.js PWA client (Port 3000) concurrently:
```sh
npm run dev
```

### Step 3: Open Wekelea PWA
Open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

---

## 🐳 Running with Docker
To spin up Wekelea inside Docker containers alongside a clean PostgreSQL database instance:

1. Build and launch all services:
   ```sh
   docker-compose up --build
   ```
2. The PWA will be available at [http://localhost:3000](http://localhost:3000) and the backend API at [http://localhost:5001](http://localhost:5001).

---

## 🕹 Step-by-Step Demo Guide (Evaluate immediately)

To assist developers, product managers, and investors evaluating the Wekelea MVP, a **Floating Demo Assist Panel** is displayed on the screen. This allows you to jump perspectives, trigger notifications, and reset states instantly!

### The Happy Path: Consensual Settlement
1. **Visit Landing Page**: Review the value proposition, trust rules, and list of public active challenges.
2. **Access App**: Click "Launch App" -> Enter phone number `0712345678` -> Enter simulated verification OTP (Type any 4 digits, e.g. `1234`) -> Click **Confirm**. You are now logged in as **@MwangiEscrow** with a pre-seeded wallet balance of KES 4,500!
3. **Create Contract**: Click **Create Challenge** -> Choose category **Sports** -> Set title to *"Gor Mahia beats AFC Leopards"* -> Drag the individual stake slider to **KES 2,000** -> Enter opponent username `Mwende_Vibe` -> Click **Lock Contract terms**.
4. **Share Modal**: A sharing modal triggers, giving a visual P2P QR Code, a Whatsapp URL, and an invite link! Click "Copy Invitation Link".
5. **Switch Perspectives**: Go to the **Demo Panel** on the right side of the screen and click **Mwende**. The app perspective immediately swaps to **@Mwende_Vibe**'s dashboard!
6. **Accept Invitation**: Click on the Bell icon in the header or check **Invites & Funding** tab. Mwende sees the active challenge notification. Click the challenge -> read objective terms -> tick terms checkbox -> click **Accept Challenge Terms**. Contract state transitions to `AWAITING_FUNDING`!
7. **Fund Escrow**: As Mwende, click **Pay Stake via M-Pesa STK**. A Safaricom M-Pesa STK SIM prompt overlay slides up. Click **Confirm PIN**. The processor contacts the simulated webhook callback, deposits KES 2,000, updates Mwende's wallet balance, and updates the contract status!
8. **Activate Escrow Vault**: Switch back to **Mwangi** via the Demo Panel. Mwangi also clicks **Pay Stake via M-Pesa STK** -> Confirms M-Pesa PIN. Both parties have funded. Wekelea’s Escrow vault activates! The contract status transitions to `🔒 ACTIVE` and is locked securely.
9. **Claim Win**: The event completes. Mwangi clicks **Claim Win & Request Settlement**. Mwende's dashboard immediately gets an alert.
10. **Settle and Disburse**: Switch to **Mwende**'s dashboard. Mwende clicks the contract details -> clicks **Consent & Settle**. 
    - The escrow releases!
    - Mwangi's wallet is credited KES 3,800 (KES 4,000 pot minus Wekelea’s 5% transaction fee of KES 200).
    - The treasury account is credited KES 200.
    - Mwangi's streak badge fires!

### The Dispute Path: Admin Override
1. Follow steps 1-8 above.
2. Mwangi claims the win.
3. Switch to **Mwende**. Mwende believes the timer was broken. Mwende clicks **Reject & Dispute** -> types a dispute explanation -> clicks **File Dispute**. Escrow vault immediately freezes and state changes to `⚖️ DISPUTED`.
4. Switch to **Admin View** using the Demo Panel.
5. Review the dispute description and evidence link in the Admin Console.
6. Type arbitration notes -> Click **Settle Mwende (Opponent)** or **Refund Both (Split)**.
7. Funds are securely disbursed according to admin arbitration, and detailed audit logs are written.
