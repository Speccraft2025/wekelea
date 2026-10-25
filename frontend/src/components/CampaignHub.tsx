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

// --- Brief-builder presets (local MVP: settle in KES, show USD for reference) ---
const USD_KES = 129.92; // CBK reference rate, 21 Oct 2026 — display only
const usd = (kesAmount: number) => '$' + Math.round((kesAmount || 0) / USD_KES).toLocaleString();
const BUDGET_PRESETS = [2500, 5000, 10000, 25000, 50000];
const RATE_PRESETS = [{ v: 260, label: 'Standard' }, { v: 350, label: 'Priority' }, { v: 500, label: 'Premium' }];
const MINVIEW_PRESETS = [500, 1000, 2500, 5000];
const CONTENT_TYPES = ['Dance clip', 'Lip-sync / POV', 'Snippet in background', 'Review / reaction', 'Choreography', 'Transition / edit', 'Any creative use'];
const LIVE_DAYS = [14, 30, 60];
const MUSIC_HOSTS: { d: string; label: string }[] = [
  { d: 'spotify', label: 'Spotify' }, { d: 'music.apple', label: 'Apple Music' }, { d: 'apple.com', label: 'Apple Music' },
  { d: 'music.youtube', label: 'YouTube Music' }, { d: 'youtube', label: 'YouTube' }, { d: 'youtu.be', label: 'YouTube' },
  { d: 'soundcloud', label: 'SoundCloud' }, { d: 'audiomack', label: 'Audiomack' }, { d: 'boomplay', label: 'Boomplay' },
  { d: 'deezer', label: 'Deezer' }, { d: 'tidal', label: 'Tidal' }, { d: 'distrokid', label: 'DistroKid' },
  { d: 'ffm.to', label: 'Feature.fm' }, { d: 'songwhip', label: 'Songwhip' }, { d: 'linktr.ee', label: 'Linktree' },
];
function isHttpUrl(url: string): boolean {
  try { const u = new URL(url.trim()); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
function detectMusicHost(url: string): string | null {
  try { const h = new URL(url.trim()).hostname.replace(/^www\./, ''); return MUSIC_HOSTS.find((x) => h.includes(x.d))?.label ?? null; } catch { return null; }
}
const chipCls = (on: boolean) =>
  `px-2 py-2 rounded-xl text-[11px] font-semibold border text-center leading-tight transition ${on ? 'bg-[#EC7505] text-black border-[#EC7505]' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'}`;

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

        {(campaign.assetUrl || campaign.contentType) && (
          <div className="flex flex-wrap items-center gap-2">
            {campaign.assetUrl && (
              <a href={campaign.assetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 bg-[#EC7505]/15 text-[#EC7505] text-[11px] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-[#EC7505]/25">
                <span>🎵</span><span>Listen to the track</span><ExternalLink size={11} />
              </a>
            )}
            {campaign.contentType && (
              <span className="bg-white/5 text-gray-300 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">{campaign.contentType}</span>
            )}
          </div>
        )}

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
  const STEPS = ['Song', 'Budget', 'Targets', 'Rules'];
  const [step, setStep] = useState(0);
  // Step 1 — Song
  const [assetUrl, setAssetUrl] = useState('');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [contentType, setContentType] = useState('');
  const [platform, setPlatform] = useState<CampaignPlatform>('TikTok');
  // Step 2 — Budget
  const [rate, setRate] = useState(260);
  const [budget, setBudget] = useState(5000);
  // Step 3 — Targets
  const [minViews, setMinViews] = useState(1000);
  const [deadline, setDeadline] = useState('');
  // Step 4 — Rules
  const [tagHandle, setTagHandle] = useState('');
  const [hashtag, setHashtag] = useState('');
  const [liveDays, setLiveDays] = useState(30);
  const [mustUseSound, setMustUseSound] = useState(true);
  const [collabsAllowed, setCollabsAllowed] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = assetUrl ? detectMusicHost(assetUrl) : null;
  const urlOk = isHttpUrl(assetUrl);
  const budgetNum = Number(budget) || 0;
  const pool = creatorPool(budgetNum);
  const fee = Math.round((budgetNum - pool) * 100) / 100;
  const tierPayout = grossPayout(Math.max(minViews, 1000), rate);
  const maxViews = rate > 0 ? Math.floor((pool / rate) * 1000) : 0;
  const poolCoversTier = pool >= tierPayout && pool >= rate;
  const deadlineOk = !!deadline && new Date(`${deadline}T23:59:59`) > new Date();
  const todayISO = new Date().toISOString().split('T')[0];

  const stepValid = [
    urlOk && title.trim().length >= 4 && brief.trim().length >= 15 && contentType !== '',
    budgetNum > 0 && rate > 0 && poolCoversTier,
    minViews >= 0 && deadlineOk,
    true,
  ];
  const allValid = stepValid.every(Boolean);

  const compiledReqs = ([
    mustUseSound ? 'Use the official sound from the linked track.' : null,
    tagHandle.trim() ? `Tag ${tagHandle.trim().startsWith('@') ? tagHandle.trim() : '@' + tagHandle.trim()} in the post.` : null,
    hashtag.trim() ? `Include ${hashtag.trim().startsWith('#') ? hashtag.trim() : '#' + hashtag.trim()}.` : null,
    `Keep the post public for at least ${liveDays} days.`,
    collabsAllowed ? 'Collaborations with other creators are allowed.' : 'Solo posts only — no collaborations.',
    '1 post per creator.',
    ...extra.map((s) => s.trim()).filter(Boolean),
  ].filter(Boolean)) as string[];

  const setExtraAt = (i: number, v: string) => setExtra((r) => r.map((x, j) => (j === i ? v : x)));

  const submit = async () => {
    if (!allValid) { setError('Please complete every step correctly before creating the brief.'); return; }
    setBusy(true); setError(null);
    try {
      const c = await WekeleaAPI.createCampaign({
        sponsorId: currentUser.id,
        title: title.trim(),
        brief: brief.trim(),
        assetUrl: assetUrl.trim(),
        contentType,
        platform,
        category: 'Creative Work',
        requirements: compiledReqs,
        ratePer1000: rate,
        budget: budgetNum,
        minViews,
        deadline: new Date(`${deadline}T23:59:59`).toISOString(),
        trustedSource: `${platform} post analytics screenshot`,
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
          <h3 className="text-lg font-black text-white flex items-center space-x-2"><span>📣</span><span>New brief</span></h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition ${i < step ? 'bg-emerald-500' : i === step ? 'bg-[#EC7505]' : 'bg-white/10'}`} />
          ))}
        </div>
        <p className="text-[10px] text-gray-400 -mt-2">Step {step + 1} of 4 · <span className="text-gray-200 font-semibold">{STEPS[step]}</span></p>

        {error && <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl">{error}</div>}

        <div className="space-y-3">
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Streaming link to the song *</label>
                <input value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" className="input-field text-xs" />
                {assetUrl && (host ? (
                  <p className="text-[10px] text-emerald-400 mt-1 flex items-center space-x-1"><Check size={11} /><span>{host} link detected</span></p>
                ) : urlOk ? (
                  <p className="text-[10px] text-amber-400 mt-1 flex items-start space-x-1"><AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /><span>Not a known streaming host — double-check this links to your song.</span></p>
                ) : (
                  <p className="text-[10px] text-rose-400 mt-1">Paste a full link starting with https://</p>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Campaign title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Clip my new single “Midnight”" className="input-field text-xs" />
                {title.trim() !== '' && title.trim().length < 4 && <p className="text-[10px] text-rose-400 mt-1">Give it a clearer title (4+ characters).</p>}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Describe the song &amp; the content you want *</label>
                <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="The vibe of the track, the hook to use, and what creators should make." className="input-field text-xs resize-none" />
                {brief.trim() !== '' && brief.trim().length < 15 && <p className="text-[10px] text-rose-400 mt-1">Add a little more detail (15+ characters).</p>}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Content type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {CONTENT_TYPES.map((ct) => (
                    <button type="button" key={ct} onClick={() => setContentType(ct)} className={chipCls(contentType === ct)}>{ct}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Platform</label>
                <div className="grid grid-cols-5 gap-2">
                  {PLATFORMS.map((p) => (
                    <button type="button" key={p.key} onClick={() => setPlatform(p.key)} className={chipCls(platform === p.key)} title={p.label}><span className="text-base">{p.emoji}</span></button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Rate per 1,000 verified views</label>
                <div className="grid grid-cols-3 gap-2">
                  {RATE_PRESETS.map((r) => (
                    <button type="button" key={r.v} onClick={() => setRate(r.v)} className={chipCls(rate === r.v)}>{r.label}<br /><span className="text-[10px] opacity-80">KES {r.v}</span></button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Campaign budget (locked in escrow)</label>
                <div className="grid grid-cols-3 gap-2">
                  {BUDGET_PRESETS.map((b) => (
                    <button type="button" key={b} onClick={() => setBudget(b)} className={chipCls(budgetNum === b)}>KES {b.toLocaleString()}<br /><span className="text-[10px] opacity-80">≈ {usd(b)}</span></button>
                  ))}
                </div>
                <input value={budget} onChange={(e) => setBudget(Number(e.target.value))} type="number" min={1} placeholder="Custom amount (KES)" className="input-field text-xs mt-2" />
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-white/5 text-[11px] space-y-1.5">
                <div className="flex justify-between text-gray-300"><span>Creator pool (90%)</span><strong className="text-white">{kes(pool)}</strong></div>
                <div className="flex justify-between text-gray-400"><span>haddy fee (10%)</span><strong className="text-gray-200">{kes(fee)}</strong></div>
                <div className="flex justify-between text-emerald-400 pt-1.5 border-t border-white/5"><span>Buys up to</span><strong>{maxViews.toLocaleString()} views</strong></div>
              </div>
              {budgetNum > 0 && !poolCoversTier && (
                <p className="text-[10px] text-rose-400 flex items-start space-x-1"><AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /><span>Budget is too low — after the 10% fee the creator pool must cover at least one {kes(rate)} payout. Raise the budget or lower the rate.</span></p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="bg-gradient-to-br from-[#EC7505]/15 to-transparent border border-[#EC7505]/20 rounded-xl p-4 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Your budget targets up to</p>
                <p className="text-2xl font-black text-white leading-tight">{maxViews.toLocaleString()} <span className="text-sm font-semibold text-gray-300">views</span></p>
                <p className="text-[10px] text-gray-500">at {kes(rate)} per 1,000 verified views</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Minimum views for a post to earn</label>
                <div className="grid grid-cols-4 gap-2">
                  {MINVIEW_PRESETS.map((v) => (
                    <button type="button" key={v} onClick={() => setMinViews(v)} className={chipCls(minViews === v)}>{v.toLocaleString()}</button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Posts below this don&apos;t qualify — it keeps out low-effort clips.</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Application deadline *</label>
                <input value={deadline} min={todayISO} onChange={(e) => setDeadline(e.target.value)} type="date" className="input-field text-xs" />
                {deadline && !deadlineOk && <p className="text-[10px] text-rose-400 mt-1">Pick a future date.</p>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Tag / mention</label>
                  <input value={tagHandle} onChange={(e) => setTagHandle(e.target.value)} placeholder="@yourname" className="input-field text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 block mb-1">Hashtag</label>
                  <input value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="#MidnightChallenge" className="input-field text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Keep post public for</label>
                <div className="grid grid-cols-3 gap-2">
                  {LIVE_DAYS.map((d) => (
                    <button type="button" key={d} onClick={() => setLiveDays(d)} className={chipCls(liveDays === d)}>{d} days</button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setMustUseSound((v) => !v)} className="w-full flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-200">
                <span>Must use the official sound</span>
                <span className={`w-9 h-5 rounded-full relative transition flex-shrink-0 ${mustUseSound ? 'bg-emerald-500' : 'bg-white/15'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${mustUseSound ? 'left-4' : 'left-0.5'}`} /></span>
              </button>
              <button type="button" onClick={() => setCollabsAllowed((v) => !v)} className="w-full flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-200">
                <span>Allow collaborations</span>
                <span className={`w-9 h-5 rounded-full relative transition flex-shrink-0 ${collabsAllowed ? 'bg-emerald-500' : 'bg-white/15'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${collabsAllowed ? 'left-4' : 'left-0.5'}`} /></span>
              </button>
              <p className="text-[10px] text-gray-500">Each creator may submit 1 post per campaign.</p>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 block mb-1">Extra requirements (optional)</label>
                <div className="space-y-2">
                  {extra.map((r, i) => (
                    <div key={i} className="flex space-x-2">
                      <input value={r} onChange={(e) => setExtraAt(i, e.target.value)} placeholder={`Requirement ${i + 1}`} className="input-field text-xs flex-1" />
                      <button type="button" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))} className="px-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400"><X size={14} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setExtra((x) => [...x, ''])} className="text-[11px] font-bold text-[#EC7505] hover:underline flex items-center space-x-1"><Plus size={12} /><span>Add requirement</span></button>
                </div>
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-white/5 text-[11px] text-gray-400 space-y-1">
                <p className="font-semibold text-gray-300">Creators will see these rules:</p>
                {compiledReqs.map((r, i) => <p key={i} className="flex items-start space-x-1"><Check size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>{r}</span></p>)}
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-white/5 text-[11px] text-gray-400 flex items-start space-x-2">
                <Lock size={13} className="text-[#EC7505] mt-0.5 flex-shrink-0" />
                <span>On create you lock <strong className="text-white">{kes(budgetNum)}</strong> — <strong className="text-gray-200">{kes(pool)}</strong> creator pool + <strong className="text-gray-200">{kes(fee)}</strong> haddy fee. Applications are free; only selected creators submit work.</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold">{step === 0 ? 'Cancel' : 'Back'}</button>
            {step < 3 ? (
              <button type="button" disabled={!stepValid[step]} onClick={() => setStep((s) => s + 1)} className="px-6 py-2.5 rounded-xl bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-black uppercase tracking-wider active:scale-95">Next</button>
            ) : (
              <button type="button" disabled={busy || !allValid} onClick={submit} className="px-6 py-2.5 rounded-xl bg-[#EC7505] hover:bg-[#D84A05] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-black uppercase tracking-wider active:scale-95">{busy ? 'Creating…' : 'Create brief'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
