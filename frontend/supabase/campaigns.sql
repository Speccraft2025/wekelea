-- ============================================================================
-- haddy — One-to-Many "Campaigns" (creator economy) — Supabase schema add-on
-- Run this AFTER schema.sql, once, in the Supabase SQL Editor.
--
-- A Campaign is a one-sponsor / many-creator agreement. A sponsor funds a fixed
-- KES budget into escrow and publishes a brief (e.g. "make a TikTok using 30s of
-- my song's chorus"). Creators claim the brief, post, and submit a link + proof.
-- When the sponsor (or an admin) verifies the view count, escrow releases
-- rate_per_1000 × verified_views / 1000 to the creator — capped by the remaining
-- budget. Payment is guaranteed because the full budget is locked up front.
--
-- This is escrow infrastructure, NOT advertising arbitrage or gambling. No wager
-- vocabulary anywhere. Mirrors schema.sql: snake_case columns, SECURITY DEFINER
-- money functions with SELECT ... FOR UPDATE row locks, RLS read-only for anon.
-- ============================================================================

-- Clean slate for the campaign layer (safe to re-run) ------------------------
drop function if exists close_campaign(text, text) cascade;
drop function if exists reject_submission(text, text, text) cascade;
drop function if exists approve_submission(text, text, integer, text) cascade;
drop function if exists submit_to_campaign(text, text, text, text, integer, text) cascade;
drop function if exists apply_to_campaign(text, text, text) cascade;
drop function if exists select_campaign_applicant(text, text) cascade;
drop function if exists fund_campaign(text, text) cascade;

drop table if exists campaign_submissions cascade;
drop table if exists campaigns cascade;

-- ============================================================================
-- Tables
-- ============================================================================
create table campaigns (
  id               text primary key,
  sponsor_id       text not null references users(id),
  title            text not null,
  brief            text not null default '',          -- full task description
  category         text not null default 'Creative Work',
  platform         text not null default 'TikTok',     -- TikTok | Instagram | YouTube | X | Other
  requirements     text[] not null default '{}',       -- objective deliverable conditions
  rate_per_1000    numeric(14,2) not null,             -- KES paid per 1,000 verified views
  min_views        integer not null default 0,         -- minimum views before a submission qualifies
  budget           numeric(14,2) not null,             -- total KES the sponsor commits
  budget_remaining numeric(14,2) not null default 0,   -- KES still available to pay out
  status           text not null default 'AWAITING_FUNDING', -- AWAITING_FUNDING | ACTIVE | CLOSED
  deadline         text not null default '',           -- campaign end (ISO)
  trusted_source   text,                               -- how views are verified
  privacy          text not null default 'Public',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table campaign_submissions (
  id             text primary key,
  campaign_id    text not null references campaigns(id),
  creator_id     text not null references users(id),
  post_url       text not null,                        -- link to the published post
  proof_link     text,                                 -- screenshot / analytics evidence
  note           text,                                 -- creator's note to the sponsor
  claimed_views  integer not null default 0,           -- views the creator reports
  verified_views integer not null default 0,           -- views the reviewer confirms
  payout_amount  numeric(14,2) not null default 0,     -- net KES paid to the creator
  status         text not null default 'SUBMITTED',    -- SUBMITTED | APPROVED | REJECTED
  review_notes   text,
  reviewed_by_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on campaigns (sponsor_id);
create index on campaigns (status);
create index on campaigns (privacy);
create index on campaign_submissions (campaign_id);
create index on campaign_submissions (creator_id);
create index on campaign_submissions (status);
create unique index campaign_submissions_one_creator_per_campaign on campaign_submissions (campaign_id, creator_id);

-- ============================================================================
-- Campaign state-machine functions (atomic, SECURITY DEFINER)
-- ============================================================================

-- Fund the campaign budget into escrow: AWAITING_FUNDING -> ACTIVE -----------
create or replace function fund_campaign(p_campaign_id text, p_sponsor_id text)
returns campaigns language plpgsql security definer as $$
declare cmp campaigns; u users; fee numeric; pool numeric;
begin
  select * into cmp from campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if cmp.sponsor_id <> p_sponsor_id then raise exception 'Only the sponsor can fund this campaign'; end if;
  if cmp.status <> 'AWAITING_FUNDING' then raise exception 'Campaign is not awaiting funding'; end if;

  select * into u from users where id = p_sponsor_id for update;
  if not found then raise exception 'User not found'; end if;
  if u.wallet_balance < cmp.budget then raise exception 'Insufficient wallet balance. Please load money via M-Pesa.'; end if;
  fee := round(cmp.budget * 0.10, 2);
  pool := cmp.budget - fee;
  if pool < cmp.rate_per_1000 then raise exception 'Creator pool must cover at least one payout tier'; end if;

  update users set wallet_balance = wallet_balance - cmp.budget where id = p_sponsor_id;

  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), p_sponsor_id, pool, 'LOCK', 'SUCCESS',
          'CMP_LOCK_' || substr(p_campaign_id,5),
          'Creator pool locked in escrow for "' || cmp.title || '"');
  update users set wallet_balance = wallet_balance + fee where id = 'admin';
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), 'admin', fee, 'FEE', 'SUCCESS', 'CMP_FEE_' || substr(p_campaign_id,5),
          'haddy 10% campaign fee for "' || cmp.title || '"');

  update campaigns set status = 'ACTIVE', budget_remaining = pool, updated_at = now()
    where id = p_campaign_id returning * into cmp;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), p_sponsor_id, 'Campaign Live 🚀',
          'Your campaign "' || cmp.title || '" is live. KES ' || cmp.budget ||
          ' was received: KES ' || pool || ' is secured for creators and KES ' || fee || ' is haddy''s campaign fee.',
          p_campaign_id, 'CAMPAIGN_ACTIVE', false);
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), p_campaign_id, p_sponsor_id, 'CAMPAIGN_FUNDED',
          'Campaign funded: KES ' || pool || ' creator pool and KES ' || fee || ' haddy fee');
  return cmp;
end; $$;

-- Creator applies to an ACTIVE campaign. Work cannot start until selected. ---
create or replace function apply_to_campaign(p_campaign_id text, p_creator_id text, p_note text)
returns campaign_submissions language plpgsql security definer as $$
declare cmp campaigns; creator users; sub campaign_submissions;
begin
  select * into cmp from campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Campaign is not accepting applications'; end if;
  if cmp.deadline <> '' and cmp.deadline::timestamptz <= now() then raise exception 'The application deadline has passed'; end if;
  if cmp.sponsor_id = p_creator_id then raise exception 'You cannot apply to your own campaign'; end if;
  if exists (select 1 from campaign_submissions where campaign_id = p_campaign_id and creator_id = p_creator_id) then
    raise exception 'You have already applied to this campaign'; end if;
  select * into creator from users where id = p_creator_id;
  if not found then raise exception 'User not found'; end if;
  insert into campaign_submissions (id, campaign_id, creator_id, post_url, note, status)
  values (gen_id('sub_'), p_campaign_id, p_creator_id, '', trim(p_note), 'APPLIED') returning * into sub;
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), cmp.sponsor_id, 'New creator application',
          coalesce(creator.username, 'A creator') || ' applied to "' || cmp.title || '". Select them to unlock delivery.',
          cmp.id, 'CAMPAIGN_SUBMISSION', false);
  return sub;
end; $$;

-- Sponsor approves an applicant to begin work. -------------------------------
create or replace function select_campaign_applicant(p_submission_id text, p_reviewer_id text)
returns campaign_submissions language plpgsql security definer as $$
declare sub campaign_submissions; cmp campaigns;
begin
  select * into sub from campaign_submissions where id = p_submission_id for update;
  if not found then raise exception 'Application not found'; end if;
  select * into cmp from campaigns where id = sub.campaign_id for update;
  if p_reviewer_id <> cmp.sponsor_id and p_reviewer_id <> 'admin' then raise exception 'Only the artist or an admin can select creators'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Campaign is closed'; end if;
  if sub.status <> 'APPLIED' then raise exception 'Only pending applications can be selected'; end if;
  update campaign_submissions set status = 'SELECTED', reviewed_by_id = p_reviewer_id, updated_at = now()
    where id = p_submission_id returning * into sub;
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), sub.creator_id, 'You were selected',
          'You have been selected for "' || cmp.title || '". Create and publish your post before submitting it for review.',
          cmp.id, 'CAMPAIGN_ACTIVE', false);
  return sub;
end; $$;

-- Selected creator submits a deliverable to an ACTIVE campaign --------------
create or replace function submit_to_campaign(
  p_campaign_id text, p_creator_id text, p_post_url text,
  p_proof_link text, p_claimed_views integer, p_note text)
returns campaign_submissions language plpgsql security definer as $$
declare cmp campaigns; creator users; sub campaign_submissions;
begin
  select * into cmp from campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Campaign is not accepting submissions'; end if;
  if cmp.sponsor_id = p_creator_id then raise exception 'You cannot submit to your own campaign'; end if;
  if p_post_url is null or length(trim(p_post_url)) = 0 then raise exception 'A link to your published post is required'; end if;

  select * into sub from campaign_submissions where campaign_id = p_campaign_id and creator_id = p_creator_id for update;
  if not found or sub.status <> 'SELECTED' then raise exception 'You must be selected before submitting work'; end if;

  select * into creator from users where id = p_creator_id;
  if not found then raise exception 'User not found'; end if;

  update campaign_submissions set post_url = trim(p_post_url), proof_link = nullif(trim(coalesce(p_proof_link,'')),''),
    note = nullif(trim(coalesce(p_note,'')),''), claimed_views = greatest(0, coalesce(p_claimed_views,0)),
    status = 'SUBMITTED', updated_at = now() where id = sub.id returning * into sub;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), cmp.sponsor_id, 'New Campaign Submission 🎬',
          coalesce(creator.username,'A creator') || ' submitted a post to "' || cmp.title ||
          '" claiming ' || sub.claimed_views || ' views. Verify to release payment.',
          p_campaign_id, 'CAMPAIGN_SUBMISSION', false);
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), p_campaign_id, p_creator_id, 'CAMPAIGN_SUBMISSION',
          creator.username || ' submitted ' || sub.post_url || ' (' || sub.claimed_views || ' claimed views)');
  return sub;
end; $$;

-- Reviewer (sponsor or admin) verifies views and releases the payout ---------
-- Creator payout = rate_per_1000 × verified_views / 1000, capped at budget_remaining.
-- haddy's 10% fee was collected when the campaign was funded, so the creator
-- receives the displayed rate in full.
create or replace function approve_submission(
  p_submission_id text, p_reviewer_id text, p_verified_views integer, p_notes text)
returns campaign_submissions language plpgsql security definer as $$
declare sub campaign_submissions; cmp campaigns; creator users;
        gross numeric; draw numeric;
begin
  select * into sub from campaign_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if sub.status <> 'SUBMITTED' then raise exception 'This submission has already been reviewed'; end if;

  select * into cmp from campaigns where id = sub.campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if p_reviewer_id <> cmp.sponsor_id and p_reviewer_id <> 'admin' then
    raise exception 'Only the sponsor or an admin can verify submissions'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Campaign is closed'; end if;
  if p_verified_views is null or p_verified_views < 0 then raise exception 'Verified views must be zero or more'; end if;
  if p_verified_views < cmp.min_views then
    raise exception 'Verified views (%) are below the campaign minimum of %', p_verified_views, cmp.min_views; end if;

  select * into creator from users where id = sub.creator_id for update;
  if not found then raise exception 'Creator record missing'; end if;

  gross := round(cmp.rate_per_1000 * p_verified_views / 1000.0, 2);
  draw  := least(gross, cmp.budget_remaining);   -- never pay beyond the locked budget
  if draw > 0 then
    update users set wallet_balance = wallet_balance + draw,
                     contracts_completed = contracts_completed + 1,
                     win_streak = win_streak + 1,
                     trust_score = least(100, trust_score + 1)
      where id = creator.id;
    update campaigns set budget_remaining = budget_remaining - draw, updated_at = now()
      where id = cmp.id returning * into cmp;

    insert into transactions (id, user_id, amount, type, status, reference, description)
    values (gen_id('tx_'), creator.id, draw, 'UNLOCK', 'SUCCESS',
            'CMP_PAY_' || substr(sub.id,5),
            'Campaign payout for ' || p_verified_views || ' verified views on "' || cmp.title || '"');
  end if;

  update campaign_submissions
    set status = 'APPROVED', verified_views = p_verified_views, payout_amount = draw,
        review_notes = p_notes, reviewed_by_id = p_reviewer_id, updated_at = now()
    where id = p_submission_id returning * into sub;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), creator.id, 'Payout Released — Funds Received! 💰',
          'Your submission to "' || cmp.title || '" was verified at ' || p_verified_views ||
          ' views. KES ' || draw || ' has been released to your wallet.',
          cmp.id, 'CAMPAIGN_PAYOUT', false);
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), cmp.id, p_reviewer_id, 'CAMPAIGN_PAYOUT',
          'Verified ' || p_verified_views || ' views. Drew KES ' || draw || ' from budget. Creator ' ||
          creator.username || ' received KES ' || draw || '.');

  -- Auto-close when the escrow budget is exhausted
  if cmp.budget_remaining <= 0 and cmp.status = 'ACTIVE' then
    update campaigns set status = 'CLOSED', updated_at = now() where id = cmp.id;
    insert into notifications (id, user_id, title, message, contract_id, type, read)
    values (gen_id('n_'), cmp.sponsor_id, 'Campaign Budget Fully Released ✅',
            'The full escrow budget for "' || cmp.title || '" has been released to creators. The campaign is now closed.',
            cmp.id, 'CAMPAIGN_ACTIVE', false);
    insert into audit_logs (id, contract_id, action, details)
    values (gen_id('log_'), cmp.id, 'CAMPAIGN_CLOSED', 'Budget exhausted — campaign auto-closed');
  end if;
  return sub;
end; $$;

-- Reviewer rejects a submission (no funds move) ------------------------------
create or replace function reject_submission(p_submission_id text, p_reviewer_id text, p_notes text)
returns campaign_submissions language plpgsql security definer as $$
declare sub campaign_submissions; cmp campaigns;
begin
  select * into sub from campaign_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if sub.status <> 'SUBMITTED' then raise exception 'This submission has already been reviewed'; end if;

  select * into cmp from campaigns where id = sub.campaign_id;
  if not found then raise exception 'Campaign not found'; end if;
  if p_reviewer_id <> cmp.sponsor_id and p_reviewer_id <> 'admin' then
    raise exception 'Only the sponsor or an admin can review submissions'; end if;

  update campaign_submissions
    set status = 'REJECTED', review_notes = p_notes, reviewed_by_id = p_reviewer_id, updated_at = now()
    where id = p_submission_id returning * into sub;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), sub.creator_id, 'Submission Not Approved',
          'Your submission to "' || cmp.title || '" was not approved. Reason: "' ||
          coalesce(nullif(trim(p_notes),''),'conditions not met') || '". You can submit again.',
          cmp.id, 'CAMPAIGN_REJECTED', false);
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), cmp.id, p_reviewer_id, 'CAMPAIGN_SUBMISSION_REJECTED',
          'Submission ' || sub.id || ' rejected. Notes: ' || coalesce(p_notes,''));
  return sub;
end; $$;

-- Sponsor (or admin) closes a campaign early; unspent budget is refunded -----
create or replace function close_campaign(p_campaign_id text, p_sponsor_id text)
returns campaigns language plpgsql security definer as $$
declare cmp campaigns; refund numeric;
begin
  select * into cmp from campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if p_sponsor_id <> cmp.sponsor_id and p_sponsor_id <> 'admin' then
    raise exception 'Only the sponsor or an admin can close this campaign'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Only an active campaign can be closed'; end if;

  refund := cmp.budget_remaining;
  if refund > 0 then
    update users set wallet_balance = wallet_balance + refund where id = cmp.sponsor_id;
    insert into transactions (id, user_id, amount, type, status, reference, description)
    values (gen_id('tx_'), cmp.sponsor_id, refund, 'UNLOCK', 'SUCCESS',
            'CMP_REFUND_' || substr(cmp.id,5),
            'Unspent campaign budget refunded for "' || cmp.title || '"');
  end if;

  update campaigns set status = 'CLOSED', budget_remaining = 0, updated_at = now()
    where id = p_campaign_id returning * into cmp;

  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), cmp.sponsor_id, 'Campaign Closed',
          'Your campaign "' || cmp.title || '" is closed. KES ' || refund ||
          ' of unspent budget was refunded to your wallet.', cmp.id, 'CAMPAIGN_ACTIVE', false);
  insert into audit_logs (id, contract_id, user_id, action, details)
  values (gen_id('log_'), cmp.id, p_sponsor_id, 'CAMPAIGN_CLOSED',
          'Campaign closed by sponsor. Refunded unspent KES ' || refund);
  return cmp;
end; $$;

-- ============================================================================
-- Reset helper: extend reset_wekelea() so demo reset also clears + reseeds
-- campaigns. Keeps the canonical user seed identical to schema.sql, then funds
-- one live demo campaign (budget deducted from the sponsor + a LOCK entry so the
-- books balance) and leaves one awaiting funding, plus a pending submission.
-- ============================================================================
create or replace function reset_wekelea()
returns void language plpgsql security definer as $$
begin
  delete from campaign_submissions where true;
  delete from campaigns            where true;
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

  -- Demo campaign 1: ACTIVE, funded by Kip_Runner (budget locked from wallet)
  insert into campaigns (id, sponsor_id, title, brief, category, platform, requirements,
                         rate_per_1000, min_views, budget, budget_remaining, status, deadline, trusted_source, privacy)
  values ('cmp_demo0001', 'u4',
          'Use 30s of my chorus on TikTok',
          'Create a TikTok using at least 30 seconds of the chorus of my new single "Nairobi Nights". Tag @kiprunner and use #NairobiNights. Earn KES 260 for every 1,000 verified views.',
          'Creative Work', 'TikTok',
          array['Use 30+ seconds of the chorus of "Nairobi Nights".','Tag @kiprunner and include #NairobiNights.','Post must stay public for at least 30 days.'],
          260, 1000, 5000, 5000, 'ACTIVE',
          '2026-12-31T23:59:59Z', 'TikTok post analytics screenshot', 'Public');
  update users set wallet_balance = wallet_balance - 5000 where id = 'u4';
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), 'u4', 5000, 'LOCK', 'SUCCESS', 'CMP_LOCK_demo0001',
          'Campaign budget locked in escrow for "Use 30s of my chorus on TikTok"');

  -- A pending submission from Achieng_Dev awaiting the sponsor's verification
  insert into campaign_submissions (id, campaign_id, creator_id, post_url, proof_link, note, claimed_views, status)
  values ('sub_demo0001', 'cmp_demo0001', 'u3',
          'https://www.tiktok.com/@achieng/video/demo123',
          'https://example.com/proof/achieng-analytics.png',
          'Posted last night, already trending in Nairobi!', 4200, 'SUBMITTED');

  -- Demo campaign 2: awaiting the sponsor to fund the escrow budget
  insert into campaigns (id, sponsor_id, title, brief, category, platform, requirements,
                         rate_per_1000, min_views, budget, budget_remaining, status, deadline, trusted_source, privacy)
  values ('cmp_demo0002', 'u1',
          'Short review of my coffee brand',
          'Film a 20–45s honest review of Mwangi Roasters coffee. Show the pack, mention the launch price, and link the shop in your bio. Earn KES 350 per 1,000 verified views.',
          'Business', 'Instagram',
          array['20–45 second video review.','Clearly show the product packaging.','Add the shop link to your bio for the post duration.'],
          350, 500, 5000, 0, 'AWAITING_FUNDING',
          '2026-12-31T23:59:59Z', 'Instagram Insights screenshot', 'Public');
end; $$;

select reset_wekelea();

-- ============================================================================
-- Row-level security + Realtime for the campaign tables
-- ============================================================================
alter table campaigns            enable row level security;
alter table campaign_submissions enable row level security;

drop policy if exists "read campaigns" on campaigns;
drop policy if exists "read campaign_submissions" on campaign_submissions;
create policy "read campaigns"            on campaigns            for select using (true);
create policy "read campaign_submissions" on campaign_submissions for select using (true);

do $$ begin
  alter publication supabase_realtime add table campaigns;
  alter publication supabase_realtime add table campaign_submissions;
exception when duplicate_object then null; end $$;
