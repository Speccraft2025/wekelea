# haddy campaign MVP: operating rules

The sole in-scope product is a one-to-many music/UGC campaign. Legacy peer-to-peer agreements are parked and must not be promoted in sales, onboarding, or operations.

## Fixed campaign lifecycle

1. An artist creates one public brief: platform, asset/hook, requirements, per-1,000-view rate, qualifying view floor, budget, verification method, and application deadline.
2. The artist locks the entire campaign budget in escrow. Only a funded campaign can receive applications.
3. Creators apply with a short fit statement. An artist (or haddy admin) selects applicants.
4. Only selected creators may publish and submit one post URL, proof link, and claimed views.
5. The artist (or haddy admin) verifies the view count, then approves or rejects the submitted work. Approval releases the payout atomically from escrow.
6. The artist closes the campaign when delivery is complete. Any unspent balance returns to the artist automatically.

## Money rule

### Local MVP launch price

The standard local TikTok clipping rate is **KES 260 per 1,000 verified views**. This is approximately USD 2 at the Central Bank of Kenya reference rate on 21 October 2026 (KES 129.92/USD); campaigns remain denominated and settled in KES, so no creator or artist carries FX risk.

The default local pilot has a **KES 5,000 all-in campaign budget**. haddy takes a transparent **10% campaign fee (KES 500)** upfront, leaving a **KES 4,500 creator pool**. At KES 260 per 1,000 views, this funds up to approximately **17,307 verified views**. Creators receive the displayed KES 260 rate in full.

`haddy campaign fee = 10% × artist campaign budget`

`creator pool = artist campaign budget − haddy campaign fee`

`creator payout = min(rate per 1,000 × verified views ÷ 1,000, remaining creator pool)`

No payout can exceed the creator pool. The exact fee is disclosed before the artist funds the campaign and recorded as a separate platform ledger entry.

## Non-negotiable launch policy

- Do not promise views, streams, saves, reach, or placement.
- Require an objectively reviewable brief and a specified proof source.
- Keep every campaign and payout decision in the audit trail.
- Use manual verification during MVP; do not claim automated platform analytics until API integrations are live.
- Review new applications and submitted posts within one business day. Escalate ambiguous verification to haddy admin before releasing funds.

## Deployment gate

For an existing Supabase project, apply `frontend/supabase/campaign-selection-migration.sql` before deploying this UI. New environments can use the full `frontend/supabase/campaigns.sql` bootstrap script instead.
