'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Check, X, ExternalLink, Clock, CheckCircle2, Users, TrendingUp,
  Award, Lock, Globe, AlertTriangle, RefreshCw, ArrowUpRight,
} from 'lucide-react';
import {
  WekeleaAPI, User, Campaign, CampaignSubmission, CampaignPlatform, AgreementCategory,
} from '../services/api';

const PLATFORMS: { key: CampaignPlatform; emoji: string; label: string }[] = [
  { key: 'TikTok', emoji: '🎵', label: 'TikTok' },
  { key: 'Instagram', emoji: '📸', label: 'Instagram' },
  { key: 'YouTube', emoji: '▶️', label: 'YouTube' },
  { key: 'X', emoji: '𝕏', label: 'X' },
  { key: 'Other', emoji: '🌐', label: 'Other' },
];

const CATEGORIES: AgreementCategory[] = [
  'Creative Work', 'Business', 'Community', 'Coaching', 'Marketplace', 'Custom',
];

const platformEmoji = (p: string) => PLATFORMS.find((x) => x.key === p)?.emoji ?? '🌐';
const kes = (n: number) => 'KES ' + Number(n || 0).toLocaleString();
const grossPayout = (views: number, rate: number) => Math.round((rate * views) / 1000 * 100) / 100;
const CAMPAIGN_FEE_RATE = 0.10;
const creatorPool = (budget: number) => Math.round(budget * (1 - CAMPAIGN_FEE_RATE) * 100) / 100;

interface Props {
  currentUser: User;
  onBack: () => void;
  onDataChanged: () => void;       // refresh wallet/user in the parent
  onDeposit: () => void;           // open the M-Pesa deposit prompt
}

type Tab = 'browse' | 'sponsor' | 'creator';

export default function CampaignHub({ currentUser, onBack, onDataChanged, onDeposit }: Props) {
  const [tab, setTab] = useState<Tab>('browse');
  const [publicCampaigns, setPublicCampaigns] = useState<Campaign[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [mySubs, setMySubs] = useState<CampaignSubmission[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [selectedSubs, setSelectedSubs] = useState<CampaignSubmission[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const refresh = useCallback(async () => {
    try {
      const [pub, mine, subs] = await Promise.all([
        WekeleaAPI.getCampaigns(),
        WekeleaAPI.getCampaigns(currentUser.id),
        WekeleaAPI.getMySubmissions(currentUser.id),
      ]);
      setPublicCampaigns(pub);
      setMyCampaigns(mine);
      setMySubs(subs);
    } catch (e: any) {
      setError(e.message);
    }
  }, [currentUser.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const openCampaign = async (id: string) => {
    setError(null);
    try {
      const { campaign, submissions } = await WekeleaAPI.getCampaign(id);
      setSelected(campaign);
      setSelectedSubs(submissions);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const afterAction = async (campaignId?: string) => {
    await refresh();
    onDataChanged();
    if (campaignId) await openCampaign(campaignId);
  };

  // ---- detail view --------------------------------------------------------
  if (selected) {
    return (
      <CampaignDetail
        campaign={selected}
        submissions={selectedSubs}
        currentUser={currentUser}
        busy={busy}
        setBusy={setBusy}
        error={error}
        setError={setError}
        flash={flash}
        onDeposit={onDeposit}
        onClose={() => { setSelected(null); setSelectedSubs([]); setError(null); }}
        onChanged={() => afterAction(selected.id)}
      />
    );
  }

  const myCreatorCampaignIds = new Set(mySubs.map((s) => s.campaignId));
  const browseList = publicCampaigns.filter(
    (c) => c.status === 'ACTIVE' && c.sponsorId !== currentUser.id,
  );

  return (
    <div className="flex flex-col space-y-6">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] bg-emerald-500 text-black text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center pt-2">
        <div>
          <h2 className="text-lg font-black text-white flex items-center space-x-2">
            <span>📣</span>
            <span>Creator Campaigns</span>
          </h2>
      <p className="text-[11px] text-gray-500">Brief once. Select creators. Pay only from funded escrow.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#EC7505] hover:bg-[#D84A05] text-black font-black text-xs py-2 px-3 rounded-xl flex items-center space-x-1 shadow transition active:scale-95"
        >
          <Plus size={14} />
          <span>New Campaign</span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 p-0.5">
        {([['browse', 'Discover'], ['sponsor', 'My Campaigns'], ['creator', 'My Submissions']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${tab === key ? 'border-[#EC7505] text-[#EC7505]' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* BROWSE / DISCOVER --------------------------------------------------- */}
      {tab === 'browse' && (
        <div className="flex flex-col space-y-4">
          {browseList.length === 0 ? (
            <EmptyState emoji="🎬" text="No open campaigns to create content for right now. Check back soon or launch your own." />
          ) : browseList.map((c) => (
            <CampaignCard key={c.id} c={c} onOpen={() => openCampaign(c.id)}
              badge={myCreatorCampaignIds.has(c.id) ? 'Submitted' : undefined} />
          ))}
        </div>
      )}

      {/* SPONSOR ------------------------------------------------------------- */}
      {tab === 'sponsor' && (
        <div className="flex flex-col space-y-4">
          {myCampaigns.length === 0 ? (
            <EmptyState emoji="📋" text="You haven't created any campaigns yet. Post a brief and fund the escrow to go live." />
          ) : myCampaigns.map((c) => (
            <CampaignCard key={c.id} c={c} onOpen={() => openCampaign(c.id)} sponsor />
          ))}
        </div>
      )}

      {/* CREATOR ------------------------------------------------------------- */}
      {tab === 'creator' && (
        <div className="flex flex-col space-y-3">
          {mySubs.length === 0 ? (
            <EmptyState emoji="✍️" text="You haven't submitted to any campaigns yet. Open a campaign in Discover to get started." />
          ) : mySubs.map((s) => {
            const camp = [...publicCampaigns, ...myCampaigns].find((c) => c.id === s.campaignId);
            return <SubmissionRow key={s.id} s={s} campaignTitle={camp?.title} onOpen={() => openCampaign(s.campaignId)} />;
          })}
        </div>
      )}

      <button onClick={onBack} className="text-xs font-semibold text-gray-400 hover:text-white underline self-start">
        ← Back to home
      </button>

      {showCreate && (
        <CreateCampaign
          currentUser={currentUser}
          onClose={() => setShowCreate(false)}
          onCreated={async (c) => { setShowCreate(false); await refresh(); setTab('sponsor'); flash('Campaign created — fund the escrow to go live.'); await openCampaign(c.id); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Shared sub-components
// ============================================================================

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="glass p-12 text-center rounded-2xl border-white/5 space-y-3">
      <span className="text-3xl block">{emoji}</span>
      <p className="text-xs text-gray-400 font-semibold">{text}</p>
    </div>
  );
}

function BudgetBar({ c }: { c: Campaign }) {
  const pool = creatorPool(c.budget);
  const spent = Math.max(0, pool - c.budgetRemaining);
  const pct = pool > 0 ? Math.min(100, Math.round((spent / pool) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{kes(spent)} released</span>
        <span>{kes(c.budgetRemaining)} creator pool left</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-[#EC7505]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPLIED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    SELECTED: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    AWAITING_FUNDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    CLOSED: 'bg-white/10 text-gray-400 border-white/10',
    SUBMITTED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    APPROVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    REJECTED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  const label: Record<string, string> = {
    APPLIED: 'Applied', SELECTED: 'Selected — create',
    AWAITING_FUNDING: 'Awaiting funding', ACTIVE: 'Live', CLOSED: 'Closed',
    SUBMITTED: 'Under review', APPROVED: 'Paid', REJECTED: 'Not approved',
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${map[status] ?? map.CLOSED}`}>
      {label[status] ?? status}
    </span>
  );
}

function CampaignCard({ c, onOpen, sponsor, badge }: { c: Campaign; onOpen: () => void; sponsor?: boolean; badge?: string }) {
  return (
    <div onClick={onOpen} className="glass glass-interactive p-5 rounded-3xl flex flex-col space-y-3 border-white/5 cursor-pointer">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-xl flex-shrink-0">{platformEmoji(c.platform)}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{c.title}</p>
            <p className="text-[10px] text-gray-500">{c.platform} · {c.category}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-1 flex-shrink-0 pl-2">
          <StatusPill status={c.status} />
          {badge && <span className="text-[9px] text-[#EC7505] font-bold">{badge}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2 border border-white/5">
        <div className="text-center">
          <p className="text-sm font-black text-[#EC7505]">{kes(c.ratePer1000)}</p>
          <p className="text-[9px] text-gray-500 uppercase">per 1,000 views</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-white">{kes(c.budget)}</p>
          <p className="text-[9px] text-gray-500 uppercase">escrow budget</p>
        </div>
      </div>

      {(sponsor || c.status !== 'AWAITING_FUNDING') && <BudgetBar c={c} />}
    </div>
  );
}

function SubmissionRow({ s, campaignTitle, onOpen }: { s: CampaignSubmission; campaignTitle?: string; onOpen: () => void }) {
  return (
    <div onClick={onOpen} className="glass glass-interactive p-4 rounded-2xl border-white/5 cursor-pointer flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white truncate">{campaignTitle ?? 'Campaign'}</p>
        <p className="text-[10px] text-gray-500">
          {s.verifiedViews ? `${s.verifiedViews.toLocaleString()} verified` : `${s.claimedViews.toLocaleString()} claimed`} views
        </p>
      </div>
      <div className="flex flex-col items-end flex-shrink-0 pl-2 space-y-1">
        <StatusPill status={s.status} />
        {s.status === 'APPROVED' && <span className="text-[11px] font-black text-emerald-400">+{kes(s.payoutAmount)}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// Campaign detail
// ============================================================================

function CampaignDetail({
  campaign, submissions, currentUser, busy, setBusy, error, setError, flash, onClose, onChanged, onDeposit,
}: {
  campaign: Campaign; submissions: CampaignSubmission[]; currentUser: User;
  busy: boolean; setBusy: (b: boolean) => void; error: string | null; setError: (e: string | null) => void;
  flash: (m: string) => void; onClose: () => void; onChanged: () => void; onDeposit: () => void;
}) {
  const isSponsor = campaign.sponsorId === currentUser.id;
  const isAdmin = currentUser.id === 'admin';
  const canReview = isSponsor || isAdmin;
  const myExisting = submissions.filter((s) => s.creatorId === currentUser.id);
  const myApplication = myExisting[0];

  const run = async (fn: () => Promise<any>, successMsg: string) => {
    setBusy(true); setError(null);
    try { await fn(); flash(successMsg); onChanged(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col space-y-5">
      <button onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-white self-start">← All campaigns</button>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}

      {/* Header card */}
      <div className="glass-premium p-5 rounded-3xl border-white/10 space-y-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-2xl">{platformEmoji(campaign.platform)}</span>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white leading-tight">{campaign.title}</h2>
              <p className="text-[10px] text-gray-500">{campaign.platform} · {campaign.category}</p>
            </div>
          </div>
          <StatusPill status={campaign.status} />
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">{campaign.brief}</p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-black/20 rounded-xl py-2 border border-white/5">
            <p className="text-sm font-black text-[#EC7505]">{kes(campaign.ratePer1000)}</p>
            <p className="text-[9px] text-gray-500 uppercase">/ 1,000 views</p>
          </div>
          <div className="bg-black/20 rounded-xl py-2 border border-white/5">
            <p className="text-sm font-black text-white">{kes(campaign.budget)}</p>
            <p className="text-[9px] text-gray-500 uppercase">escrow budget</p>
          </div>
          <div className="bg-black/20 rounded-xl py-2 border border-white/5">
            <p className="text-sm font-black text-white">{campaign.minViews.toLocaleString()}</p>
            <p className="text-[9px] text-gray-500 uppercase">min views</p>
          </div>
        </div>

        {campaign.status !== 'AWAITING_FUNDING' && <BudgetBar c={campaign} />}

        {campaign.requirements.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Deliverable requirements</p>
            {campaign.requirements.map((r, i) => (
              <p key={i} className="text-[11px] text-gray-300 flex space-x-2">
                <Check size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>{r}</span>
              </p>
            ))}
          </div>
        )}
        {campaign.trustedSource && (
          <p className="text-[10px] text-gray-500">Verification: {campaign.trustedSource}</p>
        )}
      </div>

      {/* Sponsor: fund / close */}
      {isSponsor && campaign.status === 'AWAITING_FUNDING' && (
        <div className="glass p-4 rounded-2xl border-white/5 space-y-3">
          <p className="text-xs text-gray-300">
            Lock <strong className="text-white">{kes(campaign.budget)}</strong> to publish: <strong className="text-white">{kes(creatorPool(campaign.budget))}</strong> becomes the creator pool and <strong className="text-white">{kes(campaign.budget - creatorPool(campaign.budget))}</strong> is haddy&apos;s 10% campaign fee.
          </p>
          {currentUser.walletBalance < campaign.budget ? (
            <button onClick={onDeposit} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center space-x-1.5">
              <ArrowUpRight size={14} className="text-emerald-400" />
              <span>Insufficient balance — Deposit via M-Pesa</span>
            </button>
          ) : (
            <button disabled={busy} onClick={() => run(() => WekeleaAPI.fundCampaign(campaign.id, currentUser.id), 'Campaign funded and live!')}
              className="w-full bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-50 text-black font-black py-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 active:scale-95">
              <Lock size={14} /><span>Fund Escrow & Go Live ({kes(campaign.budget)})</span>
            </button>
          )}
        </div>
      )}
      {isSponsor && campaign.status === 'ACTIVE' && (
        <button disabled={busy} onClick={() => { if (confirm('Close this campaign? Unspent creator funds are refunded to your wallet.')) run(() => WekeleaAPI.closeCampaign(campaign.id, currentUser.id), 'Campaign closed. Unspent creator funds refunded.'); }}
          className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold py-2.5 rounded-xl text-xs">
          Close campaign & refund {kes(campaign.budgetRemaining)}
        </button>
      )}

      {/* Creator flow: apply first, then publish only after selection */}
      {!isSponsor && campaign.status === 'ACTIVE' && !myApplication && (
        <ApplyForm busy={busy} onApply={(note) =>
          run(() => WekeleaAPI.applyToCampaign(campaign.id, currentUser.id, note), 'Application sent — wait for selection before you create.')}/>
      )}
      {!isSponsor && campaign.status === 'ACTIVE' && myApplication?.status === 'SELECTED' && (
        <SubmitForm campaign={campaign} busy={busy} onSubmit={(payload) =>
          run(() => WekeleaAPI.submitToCampaign(campaign.id, { userId: currentUser.id, ...payload }), 'Post received — we will verify the result and release payout.')}/>
      )}

      {/* My submissions on this campaign (creator view) */}
      {!isSponsor && myExisting.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Your submissions</p>
          {myExisting.map((s) => <ReviewRow key={s.id} s={s} canReview={false} rate={campaign.ratePer1000} busy={busy} onApprove={() => {}} onReject={() => {}} />)}
        </div>
      )}

      {/* Reviewer: all submissions to verify */}
      {canReview && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center space-x-1">
            <Users size={12} /><span>Submissions ({submissions.length})</span>
          </p>
          {submissions.length === 0 ? (
            <EmptyState emoji="🕊️" text="No submissions yet. Creators will appear here once they post." />
          ) : submissions.map((s) => (
            <ReviewRow key={s.id} s={s} canReview={canReview && campaign.status === 'ACTIVE'} rate={campaign.ratePer1000}
              budgetRemaining={campaign.budgetRemaining} busy={busy}
              onSelect={() => run(() => WekeleaAPI.selectApplicant(s.id, currentUser.id), 'Creator selected — they can now submit their post.')}
              onApprove={(views, notes) => run(() => WekeleaAPI.approveSubmission(s.id, currentUser.id, views, notes), 'Payout released to the creator.')}
              onReject={(notes) => run(() => WekeleaAPI.rejectSubmission(s.id, currentUser.id, notes), 'Submission rejected.')} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplyForm({ busy, onApply }: { busy: boolean; onApply: (note: string) => void }) {
  const [note, setNote] = useState('');
  return <form onSubmit={(e) => { e.preventDefault(); onApply(note); }} className="glass p-4 rounded-2xl border-white/5 space-y-3">
    <div>
      <p className="text-xs font-bold text-white">Apply to this campaign</p>
      <p className="text-[10px] text-gray-400 mt-1">The artist selects creators before any work begins. Do not publish until selected.</p>
    </div>
    <textarea value={note} onChange={(e) => setNote(e.target.value)} required rows={3} placeholder="Why are you a strong fit? Include your audience and content idea." className="input-field text-xs resize-none" />
    <button type="submit" disabled={busy || !note.trim()} className="w-full bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-50 text-black font-black py-3 rounded-xl text-xs">Apply to campaign</button>
  </form>;
}

function SubmitForm({ campaign, busy, onSubmit }: {
  campaign: Campaign; busy: boolean;
  onSubmit: (p: { postUrl: string; proofLink?: string; claimedViews?: number; note?: string }) => void;
}) {
  const [postUrl, setPostUrl] = useState('');
  const [proofLink, setProofLink] = useState('');
  const [claimedViews, setClaimedViews] = useState('');
  const [note, setNote] = useState('');
  const views = Math.max(0, Number(claimedViews) || 0);
  const estGross = grossPayout(views, campaign.ratePer1000);
  const estPayout = Math.min(estGross, campaign.budgetRemaining);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ postUrl, proofLink, claimedViews: views, note }); }}
      className="glass p-4 rounded-2xl border-white/5 space-y-3">
      <p className="text-xs font-bold text-white flex items-center space-x-1.5"><TrendingUp size={14} className="text-[#EC7505]" /><span>Submit your post</span></p>
      <div>
        <label className="text-[10px] font-semibold text-gray-400 block mb-1">Link to your published post *</label>
        <input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} required placeholder="https://www.tiktok.com/@you/video/..." className="input-field text-xs" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-400 block mb-1">Proof of views (screenshot URL)</label>
        <input value={proofLink} onChange={(e) => setProofLink(e.target.value)} placeholder="Link to an analytics screenshot" className="input-field text-xs" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-400 block mb-1">Current view count</label>
        <input value={claimedViews} onChange={(e) => setClaimedViews(e.target.value)} type="number" min={0} placeholder="e.g. 4200" className="input-field text-xs" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-400 block mb-1">Note to sponsor (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the sponsor should know" className="input-field text-xs" />
      </div>
      {views > 0 && (
        <p className="text-[11px] text-gray-400 bg-black/20 rounded-lg p-2.5 border border-white/5">
          Estimated payout at {views.toLocaleString()} verified views: <strong className="text-emerald-400">{kes(estPayout)}</strong>
          <span className="block text-[9px] text-gray-500 mt-0.5">Creators receive the advertised rate in full. Final payment uses the verified count and cannot exceed the creator pool left.</span>
        </p>
      )}
      <button type="submit" disabled={busy || !postUrl} className="w-full bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-50 text-black font-black py-3 rounded-xl text-xs active:scale-95">
        Submit for verification
      </button>
    </form>
  );
}

function ReviewRow({ s, canReview, rate, budgetRemaining = 0, busy, onApprove, onReject, onSelect }: {
  s: CampaignSubmission; canReview: boolean; rate: number; budgetRemaining?: number; busy: boolean;
  onApprove: (views: number, notes: string) => void; onReject: (notes: string) => void;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState(String(s.claimedViews || 0));
  const [notes, setNotes] = useState('');
  const v = Math.max(0, Number(views) || 0);
  const estPayout = Math.min(grossPayout(v, rate), budgetRemaining);

  return (
    <div className="glass p-4 rounded-2xl border-white/5 space-y-2">
      <div className="flex justify-between items-start">
        <div className="min-w-0 space-y-0.5">
          {s.postUrl ? <a href={s.postUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-xs font-bold text-[#EC7505] hover:underline flex items-center space-x-1 truncate">
            <ExternalLink size={11} className="flex-shrink-0" /><span className="truncate">{s.postUrl}</span>
          </a> : <p className="text-xs font-bold text-white">Creator application</p>}
          <p className="text-[10px] text-gray-500">
            {s.status === 'APPLIED' ? 'Awaiting artist selection'
              : s.status === 'SELECTED' ? 'Selected — awaiting published post'
              : s.status === 'APPROVED'
              ? `${s.verifiedViews.toLocaleString()} verified · paid ${kes(s.payoutAmount)}`
              : `${s.claimedViews.toLocaleString()} claimed views`}
          </p>
          {s.note && <p className="text-[10px] text-gray-400 italic">“{s.note}”</p>}
          {s.proofLink && (
            <a href={s.proofLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 hover:text-white underline">View proof</a>
          )}
          {s.reviewNotes && <p className="text-[10px] text-gray-500">Review: {s.reviewNotes}</p>}
        </div>
        <StatusPill status={s.status} />
      </div>

      {canReview && s.status === 'APPLIED' && (
        <button disabled={busy} onClick={onSelect} className="w-full mt-1 bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-50 text-black font-black py-2.5 rounded-xl text-xs">Select creator</button>
      )}
      {canReview && s.status === 'SUBMITTED' && (
        <div className="pt-1">
          {!open ? (
            <button onClick={() => setOpen(true)} className="text-[11px] font-bold text-[#EC7505] hover:underline">Verify & pay →</button>
          ) : (
            <div className="space-y-2 bg-black/20 rounded-xl p-3 border border-white/5">
              <label className="text-[10px] font-semibold text-gray-400 block">Verified view count</label>
              <input value={views} onChange={(e) => setViews(e.target.value)} type="number" min={0} className="input-field text-xs" />
              <p className="text-[11px] text-gray-400">
                Creator receives <strong className="text-emerald-400">{kes(estPayout)}</strong>.
                {grossPayout(v, rate) > budgetRemaining && <span className="text-amber-400 block text-[9px]">Capped at the remaining escrow budget ({kes(budgetRemaining)}).</span>}
              </p>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes (optional)" className="input-field text-xs" />
              <div className="flex space-x-2">
                <button disabled={busy} onClick={() => onApprove(Math.floor(v), notes)}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-black py-2.5 rounded-xl text-xs flex items-center justify-center space-x-1">
                  <CheckCircle2 size={13} /><span>Approve & Pay</span>
                </button>
                <button disabled={busy} onClick={() => { if (confirm('Reject this submission?')) onReject(notes); }}
                  className="flex-1 bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-50 text-rose-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center space-x-1">
                  <X size={13} /><span>Reject</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Create campaign
// ============================================================================

function CreateCampaign({ currentUser, onClose, onCreated }: {
  currentUser: User; onClose: () => void; onCreated: (c: Campaign) => void;
}) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [platform, setPlatform] = useState<CampaignPlatform>('TikTok');
  const [category, setCategory] = useState<AgreementCategory>('Creative Work');
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [rate, setRate] = useState('260');
  const [budget, setBudget] = useState('5000');
  const [minViews, setMinViews] = useState('1000');
  const [deadline, setDeadline] = useState('');
  const [trustedSource, setTrustedSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setReq = (i: number, v: string) => setRequirements((r) => r.map((x, j) => (j === i ? v : x)));
  const addReq = () => setRequirements((r) => [...r, '']);
  const rmReq = (i: number) => setRequirements((r) => r.filter((_, j) => j !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const c = await WekeleaAPI.createCampaign({
        sponsorId: currentUser.id, title, brief, platform, category,
        requirements: requirements.map((r) => r.trim()).filter(Boolean),
        ratePer1000: Number(rate), budget: Number(budget), minViews: Number(minViews),
        deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : undefined,
        trustedSource: trustedSource.trim() || undefined,
      });
      onCreated(c);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-premium p-6 w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl border-white/10 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-black text-white flex items-center space-x-2"><span>📣</span><span>New Campaign</span></h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {error && <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl">{error}</div>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 block mb-1">Campaign title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Use 30s of my chorus on TikTok" className="input-field text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-400 block mb-1">Brief *</label>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} required rows={3} placeholder="What should creators make? Include the sound, hook, tags, mentions and must-haves." className="input-field text-xs resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as CampaignPlatform)} className="input-field text-xs">
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as AgreementCategory)} className="input-field text-xs">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Rate per 1,000 views (KES) *</label>
              <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min={1} required className="input-field text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-400 block mb-1">Total budget (KES) *</label>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" min={1} required className="input-field text-xs" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 block mb-1">Minimum views to qualify</label>
            <input value={minViews} onChange={(e) => setMinViews(e.target.value)} type="number" min={0} className="input-field text-xs" />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 block mb-1">Application deadline *</label>
            <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" required className="input-field text-xs" />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 block mb-1">Deliverable requirements *</label>
            <div className="space-y-2">
              {requirements.map((r, i) => (
                <div key={i} className="flex space-x-2">
                  <input value={r} onChange={(e) => setReq(i, e.target.value)} placeholder={`Requirement ${i + 1}`} className="input-field text-xs flex-1" />
                  {requirements.length > 1 && (
                    <button type="button" onClick={() => rmReq(i)} className="px-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400"><X size={14} /></button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addReq} className="text-[11px] font-bold text-[#EC7505] hover:underline flex items-center space-x-1"><Plus size={12} /><span>Add requirement</span></button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 block mb-1">How are views verified? (optional)</label>
            <input value={trustedSource} onChange={(e) => setTrustedSource(e.target.value)} placeholder="e.g. TikTok analytics screenshot" className="input-field text-xs" />
          </div>

          <div className="bg-black/20 rounded-xl p-3 border border-white/5 text-[11px] text-gray-400 space-y-2">
            <div className="flex items-start space-x-2">
            <Globe size={13} className="text-[#EC7505] mt-0.5 flex-shrink-0" />
            <span>After creating, you&apos;ll lock <strong className="text-white">{kes(Number(budget) || 0)}</strong>. Applications are free; only selected creators can submit work.</span>
            </div>
            <p className="pl-5 text-[10px] text-gray-500"><strong className="text-gray-300">{kes(creatorPool(Number(budget) || 0))}</strong> is the creator pool; <strong className="text-gray-300">{kes((Number(budget) || 0) - creatorPool(Number(budget) || 0))}</strong> is haddy&apos;s 10% campaign fee. At {kes(Number(rate) || 0)} per 1,000 verified views, creators can earn up to <strong className="text-gray-300">{Math.floor(creatorPool(Number(budget) || 0) / Math.max(1, Number(rate) || 1)).toLocaleString()} full 1k-view tiers</strong>.</p>
          </div>

          <button type="submit" disabled={busy} className="w-full bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-50 text-black font-black py-3 rounded-xl text-xs uppercase tracking-wider active:scale-95">
            {busy ? 'Creating…' : 'Create Campaign'}
          </button>
        </form>
      </div>
    </div>
  );
}
