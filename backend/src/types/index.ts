export interface User {
  id: string;
  phone: string;
  username: string;
  avatar: string;
  trustScore: number; // 0 to 100
  contractsCompleted: number;
  winStreak: number;
  walletBalance: number; // KES
}

export type ContractStatus =
  | 'DRAFT'
  | 'AWAITING_ACCEPTANCE'
  | 'AWAITING_FUNDING'
  | 'ACTIVE'
  | 'CLAIMED'
  | 'SETTLED'
  | 'DISPUTED'
  | 'REFUNDED';

export type EventCategory =
  | 'Sports'
  | 'Gaming'
  | 'Politics'
  | 'Entertainment'
  | 'Crypto'
  | 'Custom';

export type PrivacySetting = 'Public' | 'Friends' | 'Private';

export interface Contract {
  id: string;
  title: string;
  category: EventCategory;
  terms: string;
  termsList: string[];
  stakeAmount: number; // KES per user
  totalPot: number; // KES (stakeAmount * 2)
  creatorId: string;
  counterpartyId?: string; // Optional until accepted
  creatorStatus: 'PENDING_FUND' | 'FUNDED';
  counterpartyStatus: 'PENDING_FUND' | 'FUNDED';
  status: ContractStatus;
  eventDate: string; // ISO date string
  settlementDeadline: string; // ISO date string
  expirationDate: string; // ISO date string for contract accept expiration
  trustedSource?: string; // Optional reference link
  trashTalk?: string; // Optional trash talk message
  privacy: PrivacySetting;
  winnerId?: string;
  claimedById?: string;
  disputeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EscrowLedger {
  id: string;
  contractId: string;
  userId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK' | 'ESCROW_RELEASE' | 'REFUND' | 'FEE_DEDUCTION';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  reference: string; // payment reference (e.g. M-Pesa transaction ID)
  createdAt: string;
}

export interface AuditLog {
  id: string;
  contractId?: string;
  userId?: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  contractId?: string;
  type: 'CONTRACT_INVITE' | 'CONTRACT_ACTIVE' | 'CLAIM_MADE' | 'DISPUTE_OPENED' | 'SETTLEMENT_APPROVED' | 'ADMIN_ACTION';
  read: boolean;
  createdAt: string;
}

export interface Dispute {
  id: string;
  contractId: string;
  openedById: string;
  reason: string;
  evidenceLink?: string;
  status: 'OPEN' | 'RESOLVED' | 'REFUNDED';
  resolutionDetails?: string;
  resolvedById?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAW' | 'LOCK' | 'UNLOCK' | 'FEE';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  reference: string;
  description: string;
  createdAt: string;
}
