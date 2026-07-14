import { supabaseAdmin } from './supabase';
import { User, Contract, Transaction, Notification, Dispute, AgreementCategory, PrivacySetting } from './types';

// --- Row → domain mappers ---------------------------------------------------

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: any) => (v ? new Date(v).toISOString() : new Date().toISOString());

export function rowToUser(r: any): User {
  return {
    id: r.id,
    phone: r.phone,
    username: r.username,
    avatar: r.avatar ?? '',
    trustScore: num(r.trust_score),
    contractsCompleted: num(r.contracts_completed),
    winStreak: num(r.win_streak),
    walletBalance: num(r.wallet_balance),
  };
}

export function rowToContract(r: any): Contract {
  return {
    id: r.id,
    title: r.title,
    category: r.category as AgreementCategory,
    terms: r.terms ?? '',
    termsList: r.terms_list ?? [],
    escrowAmount: num(r.escrow_amount),
    totalEscrow: num(r.total_escrow),
    creatorId: r.creator_id,
    counterpartyId: r.counterparty_id ?? undefined,
    creatorStatus: r.creator_status,
    counterpartyStatus: r.counterparty_status,
    status: r.status,
    eventDate: r.event_date,
    settlementDeadline: r.settlement_deadline ?? '',
    expirationDate: r.expiration_date ?? '',
    trustedSource: r.trusted_source ?? undefined,
    note: r.note ?? undefined,
    privacy: r.privacy as PrivacySetting,
    recipientId: r.recipient_id ?? undefined,
    requestedById: r.requested_by_id ?? undefined,
    disputeId: r.dispute_id ?? undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function rowToTransaction(r: any): Transaction {
  return {
    id: r.id,
    userId: r.user_id,
    amount: num(r.amount),
    type: r.type,
    status: r.status,
    reference: r.reference ?? '',
    description: r.description ?? '',
    createdAt: iso(r.created_at),
  };
}

export function rowToNotification(r: any): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    message: r.message ?? '',
    contractId: r.contract_id ?? undefined,
    type: r.type,
    read: !!r.read,
    createdAt: iso(r.created_at),
  };
}

export function rowToDispute(r: any): Dispute {
  return {
    id: r.id,
    contractId: r.contract_id,
    openedById: r.opened_by_id,
    reason: r.reason,
    evidenceLink: r.evidence_link ?? undefined,
    status: r.status,
    resolutionDetails: r.resolution_details ?? undefined,
    resolvedById: r.resolved_by_id ?? undefined,
    createdAt: iso(r.created_at),
    resolvedAt: r.resolved_at ? iso(r.resolved_at) : undefined,
  };
}

function fail(context: string, error: { message: string } | null) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// --- Reads ------------------------------------------------------------------

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabaseAdmin().from('users').select('*');
  fail('getUsers', error);
  return (data ?? []).map(rowToUser);
}

/** Look up a user by id, phone, OR username (matches the original API). */
export async function findUser(idOrPhoneOrUsername: string): Promise<User | null> {
  const v = idOrPhoneOrUsername;
  const { data, error } = await supabaseAdmin()
    .from('users')
    .select('*')
    .or(`id.eq.${v},phone.eq.${v},username.eq.${v}`)
    .limit(1);
  fail('findUser', error);
  return data && data.length ? rowToUser(data[0]) : null;
}

export async function getContracts(userId?: string): Promise<Contract[]> {
  const sb = supabaseAdmin();
  let query = sb.from('contracts').select('*').order('created_at', { ascending: false });
  if (userId) {
    query = query.or(`creator_id.eq.${userId},counterparty_id.eq.${userId}`);
  } else {
    query = query.neq('privacy', 'Private');
  }
  const { data, error } = await query;
  fail('getContracts', error);
  return (data ?? []).map(rowToContract);
}

export async function getContract(id: string): Promise<Contract | null> {
  const { data, error } = await supabaseAdmin().from('contracts').select('*').eq('id', id).maybeSingle();
  fail('getContract', error);
  return data ? rowToContract(data) : null;
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabaseAdmin()
    .from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  fail('getTransactions', error);
  return (data ?? []).map(rowToTransaction);
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabaseAdmin()
    .from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  fail('getNotifications', error);
  return (data ?? []).map(rowToNotification);
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('notifications').update({ read: true }).eq('user_id', userId);
  fail('markNotificationsRead', error);
}

export async function getDisputes(): Promise<Dispute[]> {
  const { data, error } = await supabaseAdmin().from('disputes').select('*').order('created_at', { ascending: false });
  fail('getDisputes', error);
  return (data ?? []).map(rowToDispute);
}

// --- User creation (login / signup) ----------------------------------------

export async function createUser(u: {
  id: string; phone: string; username: string; avatar: string;
  trustScore: number; contractsCompleted: number; winStreak: number; walletBalance: number;
}): Promise<User> {
  const { data, error } = await supabaseAdmin().from('users').insert({
    id: u.id, phone: u.phone, username: u.username, avatar: u.avatar,
    trust_score: u.trustScore, contracts_completed: u.contractsCompleted,
    win_streak: u.winStreak, wallet_balance: u.walletBalance,
  }).select('*').single();
  fail('createUser', error);
  return rowToUser(data);
}

// --- Contract creation ------------------------------------------------------

export async function insertContract(c: Contract): Promise<Contract> {
  const { data, error } = await supabaseAdmin().from('contracts').insert({
    id: c.id, title: c.title, category: c.category, terms: c.terms, terms_list: c.termsList,
    escrow_amount: c.escrowAmount, total_escrow: c.totalEscrow, creator_id: c.creatorId,
    counterparty_id: c.counterpartyId ?? null, creator_status: c.creatorStatus,
    counterparty_status: c.counterpartyStatus, status: c.status, event_date: c.eventDate,
    settlement_deadline: c.settlementDeadline, expiration_date: c.expirationDate,
    trusted_source: c.trustedSource ?? null, note: c.note ?? null, privacy: c.privacy,
  }).select('*').single();
  fail('insertContract', error);
  return rowToContract(data);
}

export async function insertNotification(n: {
  userId: string; title: string; message: string; contractId?: string; type: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from('notifications').insert({
    id: 'n_' + Math.random().toString(36).substring(2, 12),
    user_id: n.userId, title: n.title, message: n.message,
    contract_id: n.contractId ?? null, type: n.type, read: false,
  });
  fail('insertNotification', error);
}

export async function insertAuditLog(a: { contractId?: string; userId?: string; action: string; details: string; }): Promise<void> {
  const { error } = await supabaseAdmin().from('audit_logs').insert({
    id: 'log_' + Math.random().toString(36).substring(2, 12),
    contract_id: a.contractId ?? null, user_id: a.userId ?? null, action: a.action, details: a.details,
  });
  fail('insertAuditLog', error);
}

// --- RPC wrappers (atomic escrow operations) --------------------------------

async function rpcOne<T>(fn: string, args: Record<string, unknown>, map: (r: any) => T): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${fn} returned no row`);
  return map(row);
}

export const acceptContract = (contractId: string, userId: string) =>
  rpcOne('accept_contract', { p_contract_id: contractId, p_user_id: userId }, rowToContract);

export const lockFunds = (contractId: string, userId: string) =>
  rpcOne('lock_funds', { p_contract_id: contractId, p_user_id: userId }, rowToContract);

export const requestRelease = (contractId: string, userId: string) =>
  rpcOne('request_release', { p_contract_id: contractId, p_user_id: userId }, rowToContract);

export const approveRelease = (contractId: string, userId: string) =>
  rpcOne('approve_release', { p_contract_id: contractId, p_approver_id: userId }, rowToContract);

export const disputeRelease = (contractId: string, userId: string, reason: string) =>
  rpcOne('dispute_release', { p_contract_id: contractId, p_disputer_id: userId, p_reason: reason }, rowToContract);

export const adminResolveDispute = (disputeId: string, recipientId: string, notes: string) =>
  rpcOne('admin_resolve_dispute', { p_dispute_id: disputeId, p_recipient_id: recipientId, p_notes: notes }, rowToDispute);

export const adminRefundDispute = (disputeId: string, notes: string) =>
  rpcOne('admin_refund_dispute', { p_dispute_id: disputeId, p_notes: notes }, rowToDispute);

export const withdrawFunds = (userId: string, amount: number) =>
  rpcOne('withdraw_funds', { p_user_id: userId, p_amount: amount }, rowToUser);

export const createPendingDeposit = (userId: string, amount: number, checkoutId: string, contractId: string) =>
  rpcOne('create_pending_deposit', { p_user_id: userId, p_amount: amount, p_checkout_id: checkoutId, p_contract_id: contractId }, rowToTransaction);

export async function confirmDeposit(checkoutId: string, success: boolean, mpesaRef: string): Promise<Transaction | null> {
  const { data, error } = await supabaseAdmin().rpc('confirm_deposit', {
    p_checkout_id: checkoutId, p_success: success, p_mpesa_ref: mpesaRef,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? rowToTransaction(row) : null;
}

export async function resetDatabase(): Promise<void> {
  const { error } = await supabaseAdmin().rpc('reset_wekelea');
  if (error) throw new Error(error.message);
}
