import * as fs from 'fs';
import * as path from 'path';
import { User, Contract, EscrowLedger, AuditLog, Notification, Dispute, Transaction } from '../types';

const DB_FILE = path.join(__dirname, 'database.json');

interface Schema {
  users: User[];
  contracts: Contract[];
  escrowLedgers: EscrowLedger[];
  auditLogs: AuditLog[];
  notifications: Notification[];
  disputes: Dispute[];
  transactions: Transaction[];
}

// Simple mutex queue to prevent race conditions during concurrent modifications
class Lock {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

const dbLock = new Lock();

const INITIAL_USERS: User[] = [
  {
    id: 'u1',
    phone: '254712345678',
    username: 'MwangiEscrow',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    trustScore: 98,
    contractsCompleted: 24,
    winStreak: 4,
    walletBalance: 4500
  },
  {
    id: 'u2',
    phone: '254723456789',
    username: 'Mwende_Vibe',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    trustScore: 95,
    contractsCompleted: 18,
    winStreak: 2,
    walletBalance: 7800
  },
  {
    id: 'u3',
    phone: '254734567890',
    username: 'Achieng_Dev',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    trustScore: 89,
    contractsCompleted: 9,
    winStreak: 0,
    walletBalance: 1200
  },
  {
    id: 'u4',
    phone: '254745678901',
    username: 'Kip_Runner',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    trustScore: 99,
    contractsCompleted: 35,
    winStreak: 6,
    walletBalance: 15000
  },
  {
    id: 'admin',
    phone: '254700000000',
    username: 'WekeleaAdmin',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    trustScore: 100,
    contractsCompleted: 0,
    winStreak: 0,
    walletBalance: 100000
  }
];

const INITIAL_CONTRACTS: Contract[] = [
  {
    id: 'c1',
    title: 'Arsenal beats Manchester United',
    category: 'Sports',
    terms: 'Arsenal FC must win the Premier League match against Manchester United FC on May 28, 2026, as verified by official Premier League results. If it ends in a draw, stakes are refunded.',
    termsList: [
      'Arsenal FC must win the match against Manchester United FC on May 28, 2026.',
      'Verified by official Premier League results page.',
      'Refund stakes if match ends in a draw.'
    ],
    stakeAmount: 1000,
    totalPot: 2000,
    creatorId: 'u1',
    counterpartyId: 'u2',
    creatorStatus: 'FUNDED',
    counterpartyStatus: 'FUNDED',
    status: 'ACTIVE',
    eventDate: '2026-05-28T18:00:00Z',
    settlementDeadline: '2026-05-29T18:00:00Z',
    expirationDate: '2026-05-28T17:00:00Z',
    trustedSource: 'https://www.premierleague.com',
    trashTalk: 'Prepare to lose those shillings, Mwende! Gunners all the way.',
    privacy: 'Private',
    createdAt: '2026-05-25T10:00:00Z',
    updatedAt: '2026-05-25T10:15:00Z'
  },
  {
    id: 'c2',
    title: 'Bitcoin exceeds $72,000 on June 1',
    category: 'Crypto',
    terms: 'Bitcoin (BTC/USD) closing price on Binance on June 1, 2026, must be strictly greater than $72,000.00 USD. Verification via CoinMarketCap.',
    termsList: [
      'Bitcoin (BTC/USD) Binance closing price strictly greater than $72,000.00 USD on June 1, 2026.',
      'Verified by CoinMarketCap charts.'
    ],
    stakeAmount: 2500,
    totalPot: 5000,
    creatorId: 'u4',
    counterpartyId: 'u1',
    creatorStatus: 'FUNDED',
    counterpartyStatus: 'PENDING_FUND',
    status: 'AWAITING_FUNDING',
    eventDate: '2026-06-01T23:59:59Z',
    settlementDeadline: '2026-06-02T23:59:59Z',
    expirationDate: '2026-05-31T23:59:59Z',
    trustedSource: 'https://coinmarketcap.com/currencies/bitcoin/',
    trashTalk: 'Crypto bull market is back, Mwangi!',
    privacy: 'Private',
    createdAt: '2026-05-26T08:00:00Z',
    updatedAt: '2026-05-26T08:05:00Z'
  },
  {
    id: 'c3',
    title: 'Kendrick drops new album before June 15',
    category: 'Entertainment',
    terms: 'Kendrick Lamar must officially release a full-length studio album on major streaming services (Spotify/Apple Music) between May 26, 2026, and June 15, 2026 (East African Time). Verified by Billboard.',
    termsList: [
      'Kendrick Lamar releases a full-length studio album between May 26 and June 15, 2026.',
      'Album available on Spotify and Apple Music.',
      'Verified by Billboard official chart announcements.'
    ],
    stakeAmount: 500,
    totalPot: 1000,
    creatorId: 'u2',
    counterpartyId: 'u3',
    creatorStatus: 'FUNDED',
    counterpartyStatus: 'FUNDED',
    status: 'CLAIMED',
    eventDate: '2026-06-15T00:00:00Z',
    settlementDeadline: '2026-06-16T00:00:00Z',
    expirationDate: '2026-06-01T00:00:00Z',
    trustedSource: 'https://www.billboard.com',
    trashTalk: 'He was in the studio, Achieng. He is ready to drop!',
    privacy: 'Private',
    winnerId: 'u2',
    claimedById: 'u2',
    createdAt: '2026-05-24T12:00:00Z',
    updatedAt: '2026-05-26T09:00:00Z'
  },
  {
    id: 'c4',
    title: 'Codename X completes in under 2 hours',
    category: 'Gaming',
    terms: 'Achieng stream speedrun of Codename X must clock strictly under 2 hours 0 minutes 0 seconds as timed by the game overlay on her Twitch stream. Twitch clip required.',
    termsList: [
      'Twitch speedrun timer clocks strictly under 2 hours 0 minutes 0 seconds.',
      'Twitch clips uploaded and shared on steam feed.',
      'Conditions verified on speedrun overlays.'
    ],
    stakeAmount: 1500,
    totalPot: 3000,
    creatorId: 'u3',
    counterpartyId: 'u4',
    creatorStatus: 'FUNDED',
    counterpartyStatus: 'FUNDED',
    status: 'DISPUTED',
    eventDate: '2026-05-25T20:00:00Z',
    settlementDeadline: '2026-05-26T20:00:00Z',
    expirationDate: '2026-05-25T19:00:00Z',
    trashTalk: 'I have been practicing. You are funding my dinner tonight.',
    privacy: 'Private',
    claimedById: 'u3',
    disputeId: 'd1',
    createdAt: '2026-05-25T14:00:00Z',
    updatedAt: '2026-05-26T06:00:00Z'
  }
];

const INITIAL_DISPUTES: Dispute[] = [
  {
    id: 'd1',
    contractId: 'c4',
    openedById: 'u4',
    reason: 'The overlay timer stopped for 5 minutes during a loading screen crash. Real play time was 2 hours and 3 minutes.',
    evidenceLink: 'https://twitch.tv/clip/mock-achieng-speedrun-timer-issue',
    status: 'OPEN',
    createdAt: '2026-05-26T06:00:00Z'
  }
];

const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 't1',
    userId: 'u1',
    amount: 1000,
    type: 'LOCK',
    status: 'SUCCESS',
    reference: 'MPESA-TX-10932',
    description: 'Stake lock for "Arsenal beats Manchester United"',
    createdAt: '2026-05-25T10:10:00Z'
  },
  {
    id: 't2',
    userId: 'u2',
    amount: 1000,
    type: 'LOCK',
    status: 'SUCCESS',
    reference: 'MPESA-TX-10984',
    description: 'Stake lock for "Arsenal beats Manchester United"',
    createdAt: '2026-05-25T10:15:00Z'
  },
  {
    id: 't3',
    userId: 'u4',
    amount: 2500,
    type: 'LOCK',
    status: 'SUCCESS',
    reference: 'MPESA-TX-20831',
    description: 'Stake lock for "Bitcoin exceeds $72,000 on June 1"',
    createdAt: '2026-05-26T08:05:00Z'
  }
];

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    userId: 'u2',
    title: 'Challenge Accepted & Active! 🚀',
    message: 'MwangiEscrow accepted and funded the "Arsenal beats Manchester United" challenge. Total pot of KES 2,000 is now locked in escrow.',
    contractId: 'c1',
    type: 'CONTRACT_ACTIVE',
    read: false,
    createdAt: '2026-05-25T10:15:00Z'
  },
  {
    id: 'n2',
    userId: 'u1',
    title: 'New Challenge Received! 🤝',
    message: 'Kip_Runner has challenged you: "Bitcoin exceeds $72,000 on June 1". Stake: KES 2,500.',
    contractId: 'c2',
    type: 'CONTRACT_INVITE',
    read: false,
    createdAt: '2026-05-26T08:00:00Z'
  },
  {
    id: 'n3',
    userId: 'u4',
    title: 'Win Claimed by Counterparty ⚠️',
    message: 'Achieng_Dev claimed a win on "Codename X stream run". Review terms and approve settlement.',
    contractId: 'c4',
    type: 'CLAIM_MADE',
    read: false,
    createdAt: '2026-05-26T05:30:00Z'
  },
  {
    id: 'n4',
    userId: 'u3',
    title: 'Contract in Dispute ⚖️',
    message: 'Kip_Runner has disputed your claim on "Codename X stream run". Admin arbitration has been triggered.',
    contractId: 'c4',
    type: 'DISPUTE_OPENED',
    read: false,
    createdAt: '2026-05-26T06:00:00Z'
  }
];

export class Database {
  private static async initFile() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const defaultData: Schema = {
        users: INITIAL_USERS,
        contracts: INITIAL_CONTRACTS,
        escrowLedgers: [],
        auditLogs: [],
        notifications: INITIAL_NOTIFICATIONS,
        disputes: INITIAL_DISPUTES,
        transactions: INITIAL_TRANSACTIONS
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
  }

  private static async read(): Promise<Schema> {
    await this.initFile();
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  }

  private static async write(data: Schema): Promise<void> {
    await this.initFile();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  // --- Transactions / Safe Writing ---
  private static async executeUpdate<T>(callback: (schema: Schema) => { schema: Schema; result: T }): Promise<T> {
    await dbLock.acquire();
    try {
      const current = await this.read();
      const { schema, result } = callback(current);
      await this.write(schema);
      return result;
    } finally {
      dbLock.release();
    }
  }

  // --- API ---
  static async getUsers(): Promise<User[]> {
    const db = await this.read();
    return db.users;
  }

  static async getUser(id: string): Promise<User | undefined> {
    const db = await this.read();
    return db.users.find((u) => u.id === id || u.phone === id || u.username.toLowerCase() === id.toLowerCase());
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return this.executeUpdate<User>((schema) => {
      const index = schema.users.findIndex((u) => u.id === id);
      if (index === -1) throw new Error('User not found');
      schema.users[index] = { ...schema.users[index], ...updates };
      return { schema, result: schema.users[index] };
    });
  }

  static async createUser(user: User): Promise<User> {
    return this.executeUpdate<User>((schema) => {
      if (schema.users.some(u => u.phone === user.phone)) {
        throw new Error('Phone number already registered');
      }
      schema.users.push(user);
      return { schema, result: user };
    });
  }

  static async getContracts(): Promise<Contract[]> {
    const db = await this.read();
    return db.contracts;
  }

  static async getContract(id: string): Promise<Contract | undefined> {
    const db = await this.read();
    return db.contracts.find((c) => c.id === id);
  }

  static async createContract(contract: Contract): Promise<Contract> {
    return this.executeUpdate<Contract>((schema) => {
      schema.contracts.push(contract);
      return { schema, result: contract };
    });
  }

  static async updateContract(id: string, updates: Partial<Contract>): Promise<Contract> {
    return this.executeUpdate<Contract>((schema) => {
      const index = schema.contracts.findIndex((c) => c.id === id);
      if (index === -1) throw new Error('Contract not found');
      schema.contracts[index] = { ...schema.contracts[index], ...updates, updatedAt: new Date().toISOString() };
      return { schema, result: schema.contracts[index] };
    });
  }

  static async getDisputes(): Promise<Dispute[]> {
    const db = await this.read();
    return db.disputes;
  }

  static async getDispute(id: string): Promise<Dispute | undefined> {
    const db = await this.read();
    return db.disputes.find((d) => d.id === id);
  }

  static async createDispute(dispute: Dispute): Promise<Dispute> {
    return this.executeUpdate<Dispute>((schema) => {
      schema.disputes.push(dispute);
      return { schema, result: dispute };
    });
  }

  static async updateDispute(id: string, updates: Partial<Dispute>): Promise<Dispute> {
    return this.executeUpdate<Dispute>((schema) => {
      const index = schema.disputes.findIndex((d) => d.id === id);
      if (index === -1) throw new Error('Dispute not found');
      schema.disputes[index] = { ...schema.disputes[index], ...updates };
      return { schema, result: schema.disputes[index] };
    });
  }

  static async getTransactions(userId: string): Promise<Transaction[]> {
    const db = await this.read();
    return db.transactions.filter((t) => t.userId === userId);
  }

  static async getAllTransactions(): Promise<Transaction[]> {
    const db = await this.read();
    return db.transactions;
  }

  static async createTransaction(tx: Transaction): Promise<Transaction> {
    return this.executeUpdate<Transaction>((schema) => {
      schema.transactions.unshift(tx); // Newest first
      return { schema, result: tx };
    });
  }

  static async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    return this.executeUpdate<Transaction>((schema) => {
      const index = schema.transactions.findIndex((t) => t.id === id);
      if (index === -1) throw new Error('Transaction not found');
      schema.transactions[index] = { ...schema.transactions[index], ...updates };
      return { schema, result: schema.transactions[index] };
    });
  }

  static async getNotifications(userId: string): Promise<Notification[]> {
    const db = await this.read();
    return db.notifications.filter((n) => n.userId === userId);
  }

  static async createNotification(notification: Notification): Promise<Notification> {
    return this.executeUpdate<Notification>((schema) => {
      schema.notifications.unshift(notification);
      return { schema, result: notification };
    });
  }

  static async markNotificationsRead(userId: string): Promise<void> {
    await this.executeUpdate<void>((schema) => {
      schema.notifications = schema.notifications.map((n) =>
        n.userId === userId ? { ...n, read: true } : n
      );
      return { schema, result: undefined };
    });
  }

  static async createAuditLog(log: AuditLog): Promise<AuditLog> {
    return this.executeUpdate<AuditLog>((schema) => {
      schema.auditLogs.unshift(log);
      return { schema, result: log };
    });
  }

  static async resetDatabase(): Promise<void> {
    return this.executeUpdate<void>((schema) => {
      schema.users = INITIAL_USERS;
      schema.contracts = INITIAL_CONTRACTS;
      schema.disputes = INITIAL_DISPUTES;
      schema.transactions = INITIAL_TRANSACTIONS;
      schema.notifications = INITIAL_NOTIFICATIONS;
      schema.escrowLedgers = [];
      schema.auditLogs = [];
      return { schema, result: undefined };
    });
  }
}
