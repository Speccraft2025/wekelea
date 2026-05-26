const API_URL = 'http://localhost:5001/api';

export interface User {
  id: string;
  phone: string;
  username: string;
  avatar: string;
  trustScore: number;
  contractsCompleted: number;
  winStreak: number;
  walletBalance: number;
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
  stakeAmount: number;
  totalPot: number;
  creatorId: string;
  counterpartyId?: string;
  creatorStatus: 'PENDING_FUND' | 'FUNDED';
  counterpartyStatus: 'PENDING_FUND' | 'FUNDED';
  status: ContractStatus;
  eventDate: string;
  settlementDeadline: string;
  expirationDate: string;
  trustedSource?: string;
  trashTalk?: string;
  privacy: PrivacySetting;
  winnerId?: string;
  claimedById?: string;
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

export class WekeleaAPI {
  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown server error occurred' }));
      throw new Error(err.error || 'Server responded with an error');
    }

    return res.json() as Promise<T>;
  }

  // --- Auth ---
  static async login(phone: string): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone })
    });
  }

  static async verifyOTP(phone: string, code: string): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code })
    });
  }

  // --- User ---
  static async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  static async getUser(userId: string): Promise<User> {
    return this.request<User>(`/users/${userId}`);
  }

  static async getTransactions(userId: string): Promise<Transaction[]> {
    return this.request<Transaction[]>(`/users/${userId}/transactions`);
  }

  static async getNotifications(userId: string): Promise<Notification[]> {
    return this.request<Notification[]>(`/users/${userId}/notifications`);
  }

  static async markNotificationsRead(userId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/users/${userId}/notifications/read`, {
      method: 'POST'
    });
  }

  static async withdraw(userId: string, amount: number): Promise<{ success: boolean; user: User }> {
    return this.request<{ success: boolean; user: User }>(`/users/${userId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ amount })
    });
  }

  // --- Contracts ---
  static async getContracts(userId?: string): Promise<Contract[]> {
    const query = userId ? `?userId=${userId}` : '';
    return this.request<Contract[]>(`/contracts${query}`);
  }

  static async getContract(id: string): Promise<Contract> {
    return this.request<Contract>(`/contracts/${id}`);
  }

  static async createContract(payload: Partial<Contract> & { creatorId: string; counterpartyUsername?: string }): Promise<Contract> {
    return this.request<Contract>('/contracts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  static async acceptContract(contractId: string, userId: string): Promise<Contract> {
    return this.request<Contract>(`/contracts/${contractId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  static async fundContract(contractId: string, userId: string): Promise<Contract> {
    return this.request<Contract>(`/contracts/${contractId}/fund`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  static async claimWin(contractId: string, userId: string): Promise<Contract> {
    return this.request<Contract>(`/contracts/${contractId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  static async approveSettlement(contractId: string, userId: string): Promise<Contract> {
    return this.request<Contract>(`/contracts/${contractId}/settle`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  static async disputeClaim(contractId: string, userId: string, reason: string): Promise<Contract> {
    return this.request<Contract>(`/contracts/${contractId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ userId, reason })
    });
  }

  // --- M-Pesa Simulated STK Trigger ---
  static async initiateSTKPush(payload: { phone: string; amount: number; contractId: string; userId: string }): Promise<{ MerchantRequestID: string; CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }> {
    return this.request<{ MerchantRequestID: string; CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }>('/payments/stkpush', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // --- Callback simulator ---
  static async triggerCallback(checkoutRequestId: string, success: boolean): Promise<{ success: boolean; transaction: Transaction }> {
    return this.request<{ success: boolean; transaction: Transaction }>('/payments/callback', {
      method: 'POST',
      body: JSON.stringify({ checkoutRequestId, success })
    });
  }

  // --- Admin ---
  static async getDisputes(): Promise<Dispute[]> {
    return this.request<Dispute[]>('/disputes');
  }

  static async adminResolveDispute(disputeId: string, winnerId: string, notes: string): Promise<Dispute> {
    return this.request<Dispute>(`/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ winnerId, notes })
    });
  }

  static async adminRefundDispute(disputeId: string, notes: string): Promise<Dispute> {
    return this.request<Dispute>(`/disputes/${disputeId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  // --- System Seed/Reset ---
  static async resetDatabase(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/system/reset', {
      method: 'POST'
    });
  }
}
