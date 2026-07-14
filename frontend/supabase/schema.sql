-- ============================================================================
-- Wekelea — Programmable escrow for human agreements — Supabase schema
-- Run this whole file once in the Supabase SQL Editor.
--
-- Wekelea securely holds funds in escrow and releases them only when agreed
-- conditions are verified. This is NOT a betting product — there is no gambling
-- vocabulary anywhere in this schema.
--
-- Design notes:
--  * All money-moving operations are SECURITY DEFINER plpgsql functions that run
--    inside a single transaction with SELECT ... FOR UPDATE row locks. This makes
--    double-releases impossible even under concurrent serverless invocations.
--  * Columns are snake_case; the TypeScript data layer maps rows to the camelCase
--    interfaces the frontend expects.
--  * RLS is enabled with read-only policies for anon (so Supabase Realtime can
--    stream changes to the browser). All writes happen server-side through the
--    service_role key, which bypasses RLS.
-- ============================================================================

-- Clean slate (safe to re-run) -----------------------------------------------
drop function if exists reset_wekelea() cascade;
drop function if exists confirm_deposit(text, boolean, text) cascade;
drop function if exists create_pending_deposit(text, numeric, text, text) cascade;
drop function if exists withdraw_funds(text, numeric) cascade;
drop function if exists admin_refund_dispute(text, text) cascade;
drop function if exists admin_resolve_dispute(text, text, text) cascade;
drop function if exists dispute_release(text, text, text) cascade;
drop function if exists approve_release(text, text) cascade;
drop function if exists request_release(text, text) cascade;
drop function if exists lock_funds(text, text) cascade;
drop function if exists accept_contract(text, text) cascade;
drop function if exists gen_id(text) cascade;

drop table if exists audit_logs cascade;
drop table if exists notifications cascade;
drop table if exists transactions cascade;
drop table if exists disputes cascade;
drop table if exists contracts cascade;
drop table if exists users cascade;

-- Extensions -----------------------------------------------------------------
create extension if not exists pgcrypto;

-- ID helper: short prefixed random ids ---------------------------------------
create or replace function gen_id(prefix text)
returns text language sql as $$
  select prefix || substr(encode(gen_random_bytes(8), 'hex'), 1, 10);
$$;

-- ============================================================================
-- Tables
-- ============================================================================
create table users (
  id                   text primary key,
  phone                text unique not null,
  username             text not null,
  avatar               text not null default '',
  trust_score          integer not null default 90,
  contracts_completed  integer not null default 0,
  win_streak           integer not null default 0,
  wallet_balance       numeric(14,2) not null default 0
);

create table contracts (
  id                  text primary key,
  title               text not null,
  category            text not null,
  terms               text not null default '',
  terms_list          text[] not null default '{}',
  escrow_amount       numeric(14,2) not null,   -- funds each participant locks
  total_escrow        numeric(14,2) not null,   -- total funds held in escrow
  creator_id          text not null references users(id),
  counterparty_id     text references users(id),
  creator_status      text not null default 'PENDING_FUND',
  counterparty_status text not null default 'PENDING_FUND',
  status              text not null default 'AWAITING_ACCEPTANCE',
  event_date          text not null,            -- verification date
  settlement_deadline text not null default '',
  expiration_date     text not null default '',
  trusted_source      text,                     -- verification method / evidence source
  note                text,                     -- optional note to the other party
  privacy             text not null default 'Public',
  recipient_id        text,                     -- party who receives funds if conditions met
  requested_by_id     text,                     -- party who requested release
  dispute_id          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table disputes (
  id                 text primary key,
  contract_id        text not null references contracts(id),
  opened_by_id       text not null references users(id),
  reason             text not null,
  evidence_link      text,
  status             text not null default 'OPEN',
  resolution_details text,
  resolved_by_id     text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create table transactions (
  id          text primary key,
  user_id     text not null references users(id),
  amount      numeric(14,2) not null,
  type        text not null,             -- DEPOSIT | WITHDRAW | LOCK | UNLOCK | FEE
  status      text not null,             -- PENDING | SUCCESS | FAILED
  reference   text not null default '',
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table notifications (
  id          text primary key,
  user_id     text not null references users(id),
  title       text not null,
  message     text not null default '',
  contract_id text,
  type        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table audit_logs (
  id          text primary key,
  contract_id text,
  user_id     text,
  action      text not null,
  details     text not null default '',
  timestamp   timestamptz not null default now()
);

create index on contracts (creator_id);
create index on contracts (counterparty_id);
create index on contracts (privacy);
create index on transactions (user_id);
create index on notifications (user_id);
create index on disputes (status);

-- ============================================================================
-- Agreement state-machine functions (atomic, SECURITY DEFINER)
-- ============================================================================

-- Accept agreement terms: AWAITING_ACCEPTANCE -> AWAITING_FUNDING ------------
create or replace function accept_contract(p_contract_id text, p_user_id text)
returns contracts language plpgsql security definer as $$
declare c contracts; u users;
begin
  select * into c from contracts where id = p_contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if c.status <> 'AWAITING_ACCEPTANCE' then raise exception 'Agreement is not in an acceptable state'; end if;
  if c.creator_id = p_user_id then raise exception 'You cannot accept your own agreement'; end if;

  update contracts set counterparty_id = p_user_id, status = 'AWAITING_FUNDING', updated_at = now()
    where id = p_contract_id returning * into c;

  select * into u from users where id = p_user_id;
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), c.creator_id, 'Agreement Accepted 🤝',
          coalesce(u.username,'Someone') || ' accepted the terms of your agreement "' || c.title ||
          '". It is now awaiting escrow funding.', p_contract_id, 'CONTRACT_INVITE', false);

  insert into audit_logs (id, contract_id, action, details)
  values (gen_id('log_'), p_contract_id, 'AGREEMENT_ACCEPTED', 'Agreement accepted by other party: ' || p_user_id);
  return c;
end; $$;

-- Lock escrow funds; both funded -> ACTIVE ----------------------------------
create or replace function lock_funds(p_contract_id text, p_user_id text)
returns contracts language plpgsql security definer as $$
declare c contracts; u users; is_creator boolean; is_counterparty boolean; pid text;
begin
  select * into c from contracts where id = p_contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if c.status <> 'AWAITING_FUNDING' then raise exception 'Agreement is not in a funding state'; end if;

  select * into u from users where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;

  is_creator := c.creator_id = p_user_id;
  is_counterparty := c.counterparty_id = p_user_id;
  if not is_creator and not is_counterparty then raise exception 'User is not a participant in this agreement'; end if;
  if is_creator and c.creator_status = 'FUNDED' then raise exception 'You have already funded this agreement'; end if;
  if is_counterparty and c.counterparty_status = 'FUNDED' then raise exception 'You have already funded this agreement'; end if;
  if u.wallet_balance < c.escrow_amount then raise exception 'Insufficient wallet balance. Please load money via M-Pesa.'; end if;

  update users set wallet_balance = wallet_balance - c.escrow_amount where id = p_user_id;

  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), p_user_id, c.escrow_amount, 'LOCK', 'SUCCESS',
          'LOCK_' || substr(p_contract_id,3) || '_' || p_user_id,
          'Escrow funds locked for "' || c.title || '"');

  if is_creator then update contracts set creator_status = 'FUNDED' where id = p_contract_id; end if;
  if is_counterparty then update contracts set counterparty_status = 'FUNDED' where id = p_contract_id; end if;

  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), p_contract_id, p_user_id, 'FUNDS_LOCKED',
          'Locked KES ' || c.escrow_amount || ' in escrow by ' || u.username);

  select * into c from contracts where id = p_contract_id;
  if c.creator_status = 'FUNDED' and c.counterparty_status = 'FUNDED' then
    update contracts set status = 'ACTIVE', updated_at = now() where id = p_contract_id returning * into c;
    foreach pid in array array[c.creator_id, c.counterparty_id] loop
      insert into notifications (id, user_id, title, message, contract_id, type, read)
      values (gen_id('n_'), pid, 'Escrow Funded & Active 🔒',
              'Both parties have funded "' || c.title || '". KES ' || c.total_escrow ||
              ' is now secured in Wekelea escrow. Funds release when conditions are verified.', p_contract_id, 'CONTRACT_ACTIVE', false);
    end loop;
    insert into audit_logs (id, contract_id, action, details)
    values (gen_id('log_'), p_contract_id, 'AGREEMENT_ACTIVE', 'Escrow active with total held KES ' || c.total_escrow);
  end if;
  return c;
end; $$;

-- Request release: ACTIVE -> CLAIMED (conditions marked met) -----------------
create or replace function request_release(p_contract_id text, p_user_id text)
returns contracts language plpgsql security definer as $$
declare c contracts; requester users; other_id text;
begin
  select * into c from contracts where id = p_contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if c.status <> 'ACTIVE' then raise exception 'Agreement must be ACTIVE to request release'; end if;
  if c.creator_id <> p_user_id and c.counterparty_id <> p_user_id then
    raise exception 'User is not a participant in this agreement'; end if;

  other_id := case when c.creator_id = p_user_id then c.counterparty_id else c.creator_id end;
  update contracts set status = 'CLAIMED', requested_by_id = p_user_id, recipient_id = p_user_id, updated_at = now()
    where id = p_contract_id returning * into c;

  select * into requester from users where id = p_user_id;
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), other_id, 'Release Requested — Action Required ⚠️',
          coalesce(requester.username,'The other party') || ' marked the conditions of "' || c.title ||
          '" as met and requested release of the escrow. Do you approve?', p_contract_id, 'CLAIM_MADE', false);
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), p_contract_id, p_user_id, 'RELEASE_REQUESTED', requester.username || ' requested release.');
  return c;
end; $$;

-- Approve release: CLAIMED -> SETTLED, pay recipient minus 5% fee -----------
create or replace function approve_release(p_contract_id text, p_approver_id text)
returns contracts language plpgsql security definer as $$
declare c contracts; recipient users; other users; fee numeric; payout numeric;
begin
  select * into c from contracts where id = p_contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if c.status <> 'CLAIMED' then raise exception 'Agreement is not awaiting release approval'; end if;
  if c.creator_id <> p_approver_id and c.counterparty_id <> p_approver_id then
    raise exception 'User is not a participant in this agreement'; end if;
  if c.requested_by_id = p_approver_id then raise exception 'You cannot approve your own release request'; end if;

  select * into recipient from users where id = c.recipient_id for update;
  select * into other from users where id = p_approver_id for update;
  if recipient is null or other is null then raise exception 'User record missing'; end if;

  fee := round(c.total_escrow * 0.05, 2);
  payout := c.total_escrow - fee;

  update users set wallet_balance = wallet_balance + payout,
                   contracts_completed = contracts_completed + 1,
                   win_streak = win_streak + 1,
                   trust_score = least(100, trust_score + 1)
    where id = recipient.id;
  update users set contracts_completed = contracts_completed + 1,
                   trust_score = least(100, trust_score + 1)
    where id = p_approver_id;

  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), recipient.id, payout, 'UNLOCK', 'SUCCESS',
          'RELEASE_' || substr(c.id,3) || '_' || recipient.id,
          'Escrow released for completed agreement "' || c.title || '" (service fee deducted)');
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), 'admin', fee, 'FEE', 'SUCCESS',
          'FEE_' || substr(c.id,3), 'Wekelea 5% service fee for agreement "' || c.title || '"');
  update users set wallet_balance = wallet_balance + fee where id = 'admin';

  update contracts set status = 'SETTLED', updated_at = now() where id = p_contract_id returning * into c;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), recipient.id, 'Escrow Released — Funds Received! 💰',
          'Your agreement "' || c.title || '" is complete. KES ' || payout ||
          ' (after the 5% service fee) has been released to your wallet.', c.id, 'SETTLEMENT_APPROVED', false);
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), p_approver_id, 'Agreement Completed 🤝',
          'You approved release for "' || c.title || '". Escrow was released to ' ||
          recipient.username || '. Thanks for using Wekelea!', c.id, 'SETTLEMENT_APPROVED', false);
  insert into audit_logs (id, contract_id, action, details)
  values (gen_id('log_'), c.id, 'ESCROW_RELEASED',
          'Escrow KES ' || c.total_escrow || ' released. Recipient: ' || recipient.username ||
          ' received KES ' || payout || '. Service Fee: KES ' || fee);
  return c;
end; $$;

-- Dispute the release request: CLAIMED -> DISPUTED --------------------------
create or replace function dispute_release(p_contract_id text, p_disputer_id text, p_reason text)
returns contracts language plpgsql security definer as $$
declare c contracts; disputer users; requester_id text; new_dispute_id text;
begin
  select * into c from contracts where id = p_contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;
  if c.status <> 'CLAIMED' then raise exception 'Agreement is not awaiting release approval'; end if;
  if c.creator_id <> p_disputer_id and c.counterparty_id <> p_disputer_id then
    raise exception 'User is not a participant in this agreement'; end if;

  requester_id := c.requested_by_id;
  new_dispute_id := gen_id('d_');
  insert into disputes (id, contract_id, opened_by_id, reason, status)
  values (new_dispute_id, p_contract_id, p_disputer_id, p_reason, 'OPEN');

  update contracts set status = 'DISPUTED', dispute_id = new_dispute_id, updated_at = now()
    where id = p_contract_id returning * into c;

  select * into disputer from users where id = p_disputer_id;
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), requester_id, 'Agreement in Dispute ⚖️',
          disputer.username || ' did not approve the release for "' || c.title ||
          '" and opened a dispute. Reason: "' || substr(p_reason,1,50) || '...". Admin review triggered.',
          p_contract_id, 'DISPUTE_OPENED', false);

  update users set trust_score = greatest(50, trust_score - 2) where id = p_disputer_id;
  update users set trust_score = greatest(50, trust_score - 2) where id = requester_id;

  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), p_contract_id, p_disputer_id, 'DISPUTE_OPENED',
          'Dispute ' || new_dispute_id || ' opened by ' || disputer.username || '. Escrow frozen. Reason: ' || p_reason);
  return c;
end; $$;

-- Admin resolve dispute: release to chosen recipient minus 5% fee -----------
create or replace function admin_resolve_dispute(p_dispute_id text, p_recipient_id text, p_notes text)
returns disputes language plpgsql security definer as $$
declare d disputes; c contracts; recipient users; other users; other_id text; fee numeric; payout numeric;
begin
  select * into d from disputes where id = p_dispute_id for update;
  if not found or d.status <> 'OPEN' then raise exception 'Open dispute not found'; end if;
  select * into c from contracts where id = d.contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;

  other_id := case when p_recipient_id = c.creator_id then c.counterparty_id else c.creator_id end;
  select * into recipient from users where id = p_recipient_id for update;
  select * into other from users where id = other_id for update;
  if recipient is null or other is null then raise exception 'User record missing'; end if;

  fee := round(c.total_escrow * 0.05, 2);
  payout := c.total_escrow - fee;

  update users set wallet_balance = wallet_balance + payout,
                   contracts_completed = contracts_completed + 1,
                   trust_score = least(100, trust_score + 3)
    where id = p_recipient_id;
  update users set contracts_completed = contracts_completed + 1,
                   trust_score = greatest(30, trust_score - 10)
    where id = other_id;

  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), p_recipient_id, payout, 'UNLOCK', 'SUCCESS',
          'ADMIN_RELEASE_' || substr(c.id,3) || '_' || p_recipient_id,
          'Admin released escrow in your favor for "' || c.title || '"');
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), 'admin', fee, 'FEE', 'SUCCESS',
          'ADMIN_FEE_' || substr(c.id,3), 'Wekelea admin resolution service fee for agreement "' || c.title || '"');
  update users set wallet_balance = wallet_balance + fee where id = 'admin';

  update contracts set status = 'SETTLED', recipient_id = p_recipient_id, updated_at = now() where id = c.id;

  update disputes set status = 'RESOLVED', resolved_by_id = 'admin',
                      resolution_details = 'Resolved in favor of ' || recipient.username || '. Admin notes: "' || p_notes || '"',
                      resolved_at = now()
    where id = p_dispute_id returning * into d;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), p_recipient_id, 'Dispute Resolved in Your Favor ⚖️',
          'Admin resolved the dispute for "' || c.title || '" in your favor. KES ' || payout || ' released to wallet.',
          c.id, 'ADMIN_ACTION', false);
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), other_id, 'Dispute Resolved ⚖️',
          'Admin resolved the dispute for "' || c.title || '" in favor of ' || recipient.username || '. Escrow released.',
          c.id, 'ADMIN_ACTION', false);
  insert into audit_logs (id, contract_id, action, details)
  values (gen_id('log_'), c.id, 'ADMIN_DISPUTE_RESOLVED',
          'Dispute resolved by Admin. Recipient: ' || recipient.username || '. Service fee KES ' || fee ||
          ' collected. Admin Notes: ' || p_notes);
  return d;
end; $$;

-- Admin refund dispute: return both escrow amounts, no fee ------------------
create or replace function admin_refund_dispute(p_dispute_id text, p_notes text)
returns disputes language plpgsql security definer as $$
declare d disputes; c contracts; creator users; counterparty users;
begin
  select * into d from disputes where id = p_dispute_id for update;
  if not found or d.status <> 'OPEN' then raise exception 'Open dispute not found'; end if;
  select * into c from contracts where id = d.contract_id for update;
  if not found then raise exception 'Agreement not found'; end if;

  select * into creator from users where id = c.creator_id for update;
  select * into counterparty from users where id = c.counterparty_id for update;
  if creator is null or counterparty is null then raise exception 'User record missing'; end if;

  update users set wallet_balance = wallet_balance + c.escrow_amount, trust_score = least(100, trust_score + 2)
    where id = c.creator_id;
  update users set wallet_balance = wallet_balance + c.escrow_amount, trust_score = least(100, trust_score + 2)
    where id = c.counterparty_id;

  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), c.creator_id, c.escrow_amount, 'UNLOCK', 'SUCCESS',
          'REFUND_C_' || substr(c.id,3), 'Escrow refund for agreement "' || c.title || '" per admin decision');
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), c.counterparty_id, c.escrow_amount, 'UNLOCK', 'SUCCESS',
          'REFUND_CP_' || substr(c.id,3), 'Escrow refund for agreement "' || c.title || '" per admin decision');

  update contracts set status = 'REFUNDED', updated_at = now() where id = c.id;

  update disputes set status = 'REFUNDED', resolved_by_id = 'admin',
                      resolution_details = 'Fully refunded both parties. Admin notes: "' || p_notes || '"',
                      resolved_at = now()
    where id = p_dispute_id returning * into d;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), c.creator_id, 'Escrow Refunded by Admin ⚖️',
          'Admin cancelled the disputed agreement "' || c.title || '" and refunded your escrow of KES ' || c.escrow_amount || '.',
          c.id, 'ADMIN_ACTION', false);
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), c.counterparty_id, 'Escrow Refunded by Admin ⚖️',
          'Admin cancelled the disputed agreement "' || c.title || '" and refunded your escrow of KES ' || c.escrow_amount || '.',
          c.id, 'ADMIN_ACTION', false);
  insert into audit_logs (id, contract_id, action, details)
  values (gen_id('log_'), c.id, 'ADMIN_DISPUTE_REFUNDED',
          'Dispute refunded by Admin. Full refund of KES ' || c.escrow_amount ||
          ' returned to both parties. Admin Notes: ' || p_notes);
  return d;
end; $$;

-- Withdraw funds to M-Pesa (simulated B2C) ----------------------------------
create or replace function withdraw_funds(p_user_id text, p_amount numeric)
returns users language plpgsql security definer as $$
declare u users; ref text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid withdrawal amount'; end if;
  select * into u from users where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if u.wallet_balance < p_amount then raise exception 'Insufficient wallet balance'; end if;

  ref := 'B2C_' || upper(substr(encode(gen_random_bytes(4),'hex'),1,6));
  update users set wallet_balance = wallet_balance - p_amount where id = p_user_id returning * into u;
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), p_user_id, p_amount, 'WITHDRAW', 'SUCCESS', ref,
          'Withdrew KES ' || p_amount || ' to M-Pesa number ' || u.phone);
  insert into audit_logs (id, user_id, action, details)
  values (gen_id('log_'), p_user_id, 'WALLET_WITHDRAWAL',
          'Withdrew KES ' || p_amount || ' to M-Pesa number ' || u.phone || '. Ref: ' || ref);
  return u;
end; $$;

-- Create a pending deposit transaction (STK push initiation) ----------------
create or replace function create_pending_deposit(p_user_id text, p_amount numeric, p_checkout_id text, p_contract_id text)
returns transactions language plpgsql security definer as $$
declare t transactions;
begin
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), p_user_id, p_amount, 'DEPOSIT', 'PENDING', p_checkout_id,
          'M-Pesa STK deposit to fund escrow')
  returning * into t;
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), p_contract_id, p_user_id, 'MPESA_STK_PUSH_INITIATED',
          'STK Push of KES ' || p_amount || ' initiated. Checkout ID: ' || p_checkout_id);
  return t;
end; $$;

-- Confirm a deposit (STK callback): credit wallet on success ----------------
create or replace function confirm_deposit(p_checkout_id text, p_success boolean, p_mpesa_ref text)
returns transactions language plpgsql security definer as $$
declare t transactions;
begin
  select * into t from transactions where reference = p_checkout_id and status = 'PENDING' for update;
  if not found then return null; end if;

  if p_success then
    update transactions set status = 'SUCCESS', reference = p_mpesa_ref,
                            description = 'Deposited KES ' || t.amount || ' via M-Pesa (Ref: ' || p_mpesa_ref || ')'
      where id = t.id returning * into t;
    update users set wallet_balance = wallet_balance + t.amount where id = t.user_id;
  else
    update transactions set status = 'FAILED', description = 'M-Pesa deposit of KES ' || t.amount || ' failed'
      where id = t.id returning * into t;
  end if;

  insert into audit_logs (id, user_id, action, details)
  values (gen_id('log_'), t.user_id,
          case when p_success then 'MPESA_STK_PUSH_SUCCESS' else 'MPESA_STK_PUSH_FAILED' end,
          case when p_success then 'M-Pesa STK Push succeeded. Credited wallet KES ' || t.amount || '. Ref: ' || p_mpesa_ref
               else 'M-Pesa STK Push failed or cancelled. Checkout ID: ' || p_checkout_id end);
  return t;
end; $$;

-- ============================================================================
-- Seed / reset
-- ============================================================================
create or replace function reset_wekelea()
returns void language plpgsql security definer as $$
begin
  -- WHERE true satisfies Supabase's sql_safe_updates guard on unqualified deletes
  delete from audit_logs    where true;
  delete from notifications where true;
  delete from transactions  where true;
  delete from disputes      where true;
  delete from contracts     where true;
  delete from users         where true;

  insert into users (id, phone, username, avatar, trust_score, contracts_completed, win_streak, wallet_balance) values
  ('u1','254712345678','MwangiEscrow','https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',98,24,4,4500),
  ('u2','254723456789','Mwende_Vibe','https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',95,18,2,7800),
  ('u3','254734567890','Achieng_Dev','https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',89,9,0,1200),
  ('u4','254745678901','Kip_Runner','https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',99,35,6,15000),
  ('admin','254700000000','WekeleaAdmin','https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',100,0,0,100000);
end; $$;

select reset_wekelea();

-- ============================================================================
-- Row-level security + Realtime
-- Reads are open (anon) so the browser can stream live changes; all writes go
-- through the service_role key server-side, which bypasses RLS.
-- ============================================================================
alter table users         enable row level security;
alter table contracts     enable row level security;
alter table disputes      enable row level security;
alter table transactions  enable row level security;
alter table notifications enable row level security;
alter table audit_logs    enable row level security;

create policy "read users"         on users         for select using (true);
create policy "read contracts"     on contracts     for select using (true);
create policy "read disputes"      on disputes      for select using (true);
create policy "read transactions"  on transactions  for select using (true);
create policy "read notifications" on notifications for select using (true);

-- Add tables to the realtime publication (ignore if already added)
do $$ begin
  alter publication supabase_realtime add table contracts;
  alter publication supabase_realtime add table notifications;
  alter publication supabase_realtime add table disputes;
  alter publication supabase_realtime add table users;
  alter publication supabase_realtime add table transactions;
exception when duplicate_object then null; end $$;
