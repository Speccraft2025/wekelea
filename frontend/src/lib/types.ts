// Domain types (camelCase) returned by the API — mirror the frontend interfaces.
// Wekelea is escrow infrastructure for agreements. No gambling vocabulary.

export type ContractStatus =
  | 'DRAFT' | 'AWAITING_ACCEPTANCE' | 'AWAITING_FUNDING' | 'ACTIVE'
  | 'CLAIMED' | 'SETTLED' | 'DISPUTED' | 'REFUNDED';
// NOTE: CLAIMED and SETTLED are internal state tokens only. The UI presents them
// as "Release Requested" and "Completed" — the raw tokens are never shown.

export type AgreementCategory =
  | 'Creative Work' | 'Freelance' | 'Personal Goal' | 'Fitness' | 'Business'
  | 'Lending' | 'Marketplace' | 'Deliveries' | 'Coaching' | 'Community' | 'Custom';

export type PrivacySetting = 'Public' | 'Friends' | 'Private';

export interface User {
  id: string;
  phone: string;
  username: string;
  avatar: string;
  trustScore: number;
  contractsCompleted: number;   // agreements completed
  winStreak: number;            // consecutive fulfilled agreements (internal metric)
  walletBalance: number;
}

export interface Contract {
  id: string;
  title: string;
  category: AgreementCategory;
  terms: string;
  termsList: string[];
  escrowAmount: number;         // funds each participant locks in escrow (KES)
  totalEscrow: number;          // total funds held in escrow
  creatorId: string;
  counterpartyId?: string;      // the other party
  creatorStatus: 'PENDING_FUND' | 'FUNDED';
  counterpartyStatus: 'PENDING_FUND' | 'FUNDED';
  status: ContractStatus;
  eventDate: string;            // verification date
  settlementDeadline: string;
  expirationDate: string;
  trustedSource?: string;       // verification method / evidence source
  note?: string;                // optional note to the other party
  privacy: PrivacySetting;
  recipientId?: string;         // party who receives the funds if conditions are met
  requestedById?: string;       // party who confirmed completion and requested release
  disputeId?: string;
  createdAt: string;
  updatedAt: string;
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
