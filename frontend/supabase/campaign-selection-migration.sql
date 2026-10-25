-- haddy campaign MVP: add the apply -> select -> submit gate to an existing database.
-- Run this once in the Supabase SQL editor after campaigns.sql is already installed.
-- It is non-destructive: it does not reset campaigns, users, wallets, or ledger data.

create unique index if not exists campaign_submissions_one_creator_per_campaign
  on campaign_submissions (campaign_id, creator_id);

-- Price rule for campaigns funded after this migration: haddy retains 10% of
-- the all-in campaign budget at funding; the remaining 90% is the creator pool.
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
  fee := round(cmp.budget * 0.10, 2); pool := cmp.budget - fee;
  if pool < cmp.rate_per_1000 then raise exception 'Creator pool must cover at least one payout tier'; end if;
  update users set wallet_balance = wallet_balance - cmp.budget where id = p_sponsor_id;
  update users set wallet_balance = wallet_balance + fee where id = 'admin';
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), p_sponsor_id, pool, 'LOCK', 'SUCCESS', 'CMP_LOCK_' || substr(p_campaign_id,5), 'Creator pool locked in escrow for "' || cmp.title || '"'),
         (gen_id('tx_'), 'admin', fee, 'FEE', 'SUCCESS', 'CMP_FEE_' || substr(p_campaign_id,5), 'haddy 10% campaign fee for "' || cmp.title || '"');
  update campaigns set status = 'ACTIVE', budget_remaining = pool, updated_at = now() where id = p_campaign_id returning * into cmp;
  return cmp;
end; $$;

-- Pay the creator the published rate in full; the haddy fee is already paid.
create or replace function approve_submission(p_submission_id text, p_reviewer_id text, p_verified_views integer, p_notes text)
returns campaign_submissions language plpgsql security definer as $$
declare sub campaign_submissions; cmp campaigns; creator users; gross numeric; draw numeric;
begin
  select * into sub from campaign_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if sub.status <> 'SUBMITTED' then raise exception 'This submission has already been reviewed'; end if;
  select * into cmp from campaigns where id = sub.campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if p_reviewer_id <> cmp.sponsor_id and p_reviewer_id <> 'admin' then raise exception 'Only the sponsor or an admin can verify submissions'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Campaign is closed'; end if;
  if p_verified_views is null or p_verified_views < cmp.min_views then raise exception 'Verified views are below the campaign minimum'; end if;
  select * into creator from users where id = sub.creator_id for update;
  if not found then raise exception 'Creator record missing'; end if;
  gross := round(cmp.rate_per_1000 * p_verified_views / 1000.0, 2); draw := least(gross, cmp.budget_remaining);
  update users set wallet_balance = wallet_balance + draw, contracts_completed = contracts_completed + 1, win_streak = win_streak + 1, trust_score = least(100, trust_score + 1) where id = creator.id;
  update campaigns set budget_remaining = budget_remaining - draw, updated_at = now() where id = cmp.id returning * into cmp;
  insert into transactions (id, user_id, amount, type, status, reference, description)
  values (gen_id('tx_'), creator.id, draw, 'UNLOCK', 'SUCCESS', 'CMP_PAY_' || substr(sub.id,5), 'Campaign payout for ' || p_verified_views || ' verified views on "' || cmp.title || '"');
  update campaign_submissions set status = 'APPROVED', verified_views = p_verified_views, payout_amount = draw, review_notes = p_notes, reviewed_by_id = p_reviewer_id, updated_at = now() where id = sub.id returning * into sub;
  return sub;
end; $$;

create or replace function apply_to_campaign(p_campaign_id text, p_creator_id text, p_note text)
returns campaign_submissions language plpgsql security definer as $$
declare cmp campaigns; creator users; sub campaign_submissions;
begin
  select * into cmp from campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  if cmp.status <> 'ACTIVE' then raise exception 'Campaign is not accepting applications'; end if;
  if cmp.deadline <> '' and cmp.deadline::timestamptz <= now() then raise exception 'The application deadline has passed'; end if;
  if cmp.sponsor_id = p_creator_id then raise exception 'You cannot apply to your own campaign'; end if;
  if exists (select 1 from campaign_submissions where campaign_id = p_campaign_id and creator_id = p_creator_id) then raise exception 'You have already applied to this campaign'; end if;
  select * into creator from users where id = p_creator_id;
  if not found then raise exception 'User not found'; end if;
  insert into campaign_submissions (id, campaign_id, creator_id, post_url, note, status)
  values (gen_id('sub_'), p_campaign_id, p_creator_id, '', trim(p_note), 'APPLIED') returning * into sub;
  insert into notifications (id, user_id, title, message, contract_id, type, read)
  values (gen_id('n_'), cmp.sponsor_id, 'New creator application',
    coalesce(creator.username, 'A creator') || ' applied to "' || cmp.title || '". Select them to unlock delivery.', cmp.id, 'CAMPAIGN_SUBMISSION', false);
  return sub;
end; $$;

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
    'You have been selected for "' || cmp.title || '". Create and publish your post before submitting it for review.', cmp.id, 'CAMPAIGN_ACTIVE', false);
  return sub;
end; $$;

create or replace function submit_to_campaign(p_campaign_id text, p_creator_id text, p_post_url text, p_proof_link text, p_claimed_views integer, p_note text)
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
    coalesce(creator.username,'A creator') || ' submitted a post to "' || cmp.title || '" claiming ' || sub.claimed_views || ' views. Verify to release payment.', cmp.id, 'CAMPAIGN_SUBMISSION', false);
  return sub;
end; $$;
