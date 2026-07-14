'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Wallet, 
  Bell, 
  Plus, 
  Share2, 
  Check, 
  X, 
  User as UserIcon, 
  TrendingUp, 
  AlertTriangle, 
  ExternalLink, 
  MessageSquare, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Users, 
  Copy, 
  CheckCircle2, 
  Clock, 
  Award, 
  Lock, 
  Globe, 
  RefreshCw,
  Sliders,
  Scale,
  Trash2
} from 'lucide-react';
import { WekeleaAPI, User, Contract, Dispute, Transaction, Notification, AgreementCategory, PrivacySetting } from '../services/api';
import { supabaseBrowser } from '../lib/supabaseBrowser';
import dynamic from 'next/dynamic';
import { QRCodeSVG } from 'qrcode.react';

const ThreeDSplashScreen = dynamic(() => import('../components/ThreeDSplashScreen'), {
  ssr: false
});

export default function WekeleaApp() {
  // --- STATE ---
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  // Admin: lookup maps so dispute resolution targets the real contract parties
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [contractsByDispute, setContractsByDispute] = useState<Record<string, Contract>>({});

  // Active UI views
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'create-contract' | 'wallet' | 'admin' | 'dispute-details'>('landing');
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'completed'>('active');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [showMpesaPrompt, setShowMpesaPrompt] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  
  // Form controls
  const [loginPhone, setLoginPhone] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [adminResolutionNotes, setAdminResolutionNotes] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  // Legal policy modal (Terms / Privacy / Responsible Use)
  const [legalModal, setLegalModal] = useState<null | 'terms' | 'privacy' | 'responsible'>(null);
  // Deep-link: contractId from ?contractId= that we want to open once the user is authenticated
  const [pendingContractId, setPendingContractId] = useState<string | null>(null);

  // New Contract creation fields
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<AgreementCategory>('Creative Work');
  const [newTerms, setNewTerms] = useState('');
  const [newTermsList, setNewTermsList] = useState<string[]>(['']);
  const [newEscrow, setNewEscrow] = useState('1000');
  const [newEventDate, setNewEventDate] = useState('');
  const [newTrustedSource, setNewTrustedSource] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newPrivacy, setNewPrivacy] = useState<PrivacySetting>('Private');
  const [newCounterparty, setNewCounterparty] = useState('');
  const [claimChecklist, setClaimChecklist] = useState<Record<number, boolean>>({});
  const [settleChecklist, setSettleChecklist] = useState<Record<number, boolean>>({});

  // Payment states
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaAmount, setMpesaAmount] = useState(0);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [mpesaError, setMpesaError] = useState<string | null>(null);
  const [mpesaStatusMsg, setMpesaStatusMsg] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);

  // Demo Assist states
  const [demoSelectedRole, setDemoSelectedRole] = useState<'creator' | 'counterparty'>('creator');
  const [notificationBanner, setNotificationBanner] = useState<{ title: string; message: string } | null>(null);

  // --- COMPONENT MOUNT & DATA INITIALIZATION ---
  useEffect(() => {
    // Capture a shared contract deep-link (?contractId=...) before anything else
    const params = new URLSearchParams(window.location.search);
    const linkedContractId = params.get('contractId');
    if (linkedContractId) {
      setPendingContractId(linkedContractId);
    }

    // Attempt auto-login with first user for demo ease
    const savedUser = localStorage.getItem('wekelea_user');
    if (savedUser) {
      try {
        const userObj = JSON.parse(savedUser);
        setCurrentUser(userObj);
        setCurrentView('dashboard');
      } catch (e) {
        // Clear corrupt storage
        localStorage.removeItem('wekelea_user');
      }
    } else if (linkedContractId) {
      // Not logged in but arriving via an invite link — prompt sign-in
      setShowLoginModal(true);
    }
  }, []);

  // Resolve a pending deep-linked contract once the user is authenticated
  useEffect(() => {
    if (!currentUser || !pendingContractId) return;
    let cancelled = false;
    WekeleaAPI.getContract(pendingContractId)
      .then((contract) => {
        if (cancelled) return;
        setCurrentView('dashboard');
        setSelectedContract(contract);
      })
      .catch((err) => console.error('Deep-link contract not found:', err))
      .finally(() => {
        if (!cancelled) {
          setPendingContractId(null);
          // Strip the query param so a refresh doesn't reopen it
          window.history.replaceState({}, '', window.location.pathname);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, pendingContractId]);

  // Reset checklists when active contract changes
  useEffect(() => {
    setClaimChecklist({});
    setSettleChecklist({});
  }, [selectedContract?.id]);

  // Fetch data periodically or when user changes
  useEffect(() => {
    if (!currentUser) {
      // If not logged in, fetch general public contracts for landing page
      WekeleaAPI.getContracts()
        .then(setContracts)
        .catch(console.error);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch contracts involving current user
        const userContracts = await WekeleaAPI.getContracts(currentUser.id);
        setContracts(userContracts);

        // Update selected contract details if one is open
        if (selectedContract) {
          const freshDetails = await WekeleaAPI.getContract(selectedContract.id);
          setSelectedContract(freshDetails);
        }

        // Fetch transactions, notifications, and disputes
        const userTxs = await WekeleaAPI.getTransactions(currentUser.id);
        setTransactions(userTxs);

        const userNotes = await WekeleaAPI.getNotifications(currentUser.id);
        setNotifications(userNotes);

        if (currentUser.id === 'admin') {
          const allDisputes = await WekeleaAPI.getDisputes();
          setDisputes(allDisputes);

          // Build a user lookup so we can label + target the real contract parties
          const allUsers = await WekeleaAPI.getUsers();
          setUsersById(Object.fromEntries(allUsers.map((u) => [u.id, u])));

          // Fetch the contract behind each dispute (admin doesn't own them)
          const disputeContracts = await Promise.all(
            allDisputes.map((d) =>
              WekeleaAPI.getContract(d.contractId)
                .then((c) => [d.id, c] as const)
                .catch(() => null)
            )
          );
          setContractsByDispute(
            Object.fromEntries(disputeContracts.filter((e): e is readonly [string, Contract] => e !== null))
          );
        }
      } catch (err) {
        console.error('API Error: Data fetching failed, using fallback mock states', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll every 4s for backup sync

    return () => clearInterval(interval);
  }, [currentUser, selectedContract?.id]);

  // Live updates via Supabase Realtime. If Supabase isn't configured in the
  // browser, this is a no-op and the 4s polling effect above keeps things fresh.
  useEffect(() => {
    if (!currentUser) return;
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const refresh = async () => {
      try {
        const [freshContracts, freshNotes] = await Promise.all([
          WekeleaAPI.getContracts(currentUser.id),
          WekeleaAPI.getNotifications(currentUser.id),
        ]);
        setContracts(freshContracts);
        setNotifications(freshNotes);
        // Keep an open agreement detail in sync from the fresh list
        setSelectedContract(prev => (prev ? freshContracts.find(c => c.id === prev.id) ?? prev : prev));
        if (currentUser.id === 'admin') {
          setDisputes(await WekeleaAPI.getDisputes());
        }
      } catch (e) {
        console.error('Realtime refresh failed', e);
      }
    };

    const channel = supabase
      .channel('wekelea-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, refresh)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        (payload: { new?: { title?: string } }) => {
          setNotificationBanner({
            title: payload.new?.title || 'New update',
            message: 'Click to open details and sync live status.',
          });
          setTimeout(() => setNotificationBanner(null), 5000);
          refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${currentUser.id}` },
        (payload: { new?: { wallet_balance?: number | string } }) => {
          const bal = payload.new?.wallet_balance;
          if (bal !== undefined) setCurrentUser(prev => (prev ? { ...prev, walletBalance: Number(bal) } : prev));
        }
      )
      .subscribe((status: string) => setIsConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  // --- HANDLERS ---
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone) return;

    if (!isOtpStep) {
      // Simulate SMS OTP delivery
      setIsOtpStep(true);
      return;
    }

    try {
      const { user } = await WekeleaAPI.login(loginPhone);
      setCurrentUser(user);
      localStorage.setItem('wekelea_user', JSON.stringify(user));
      setShowLoginModal(false);
      setIsOtpStep(false);
      setLoginPhone('');
      setLoginCode('');
      setCurrentView('dashboard');
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wekelea_user');
    setCurrentUser(null);
    setSelectedContract(null);
    setCurrentView('landing');
  };

  const handleSwitchUser = async (targetUsername: string) => {
    try {
      const allUsers = await WekeleaAPI.getUsers();
      // Helper to easily change profiles for demonstrations
      const targetUserObj = allUsers.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
      if (targetUserObj) {
        setCurrentUser(targetUserObj);
        localStorage.setItem('wekelea_user', JSON.stringify(targetUserObj));
        setSelectedContract(null);
        setCurrentView('dashboard');
      }
    } catch (e) {
      // In case server not running, provide local emulation
      const fallbackMapping: Record<string, User> = {
        'mwangs': { id: 'u1', phone: '254712345678', username: 'MwangiEscrow', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', trustScore: 98, contractsCompleted: 24, winStreak: 4, walletBalance: 4500 },
        'mwende': { id: 'u2', phone: '254723456789', username: 'Mwende_Vibe', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', trustScore: 95, contractsCompleted: 18, winStreak: 2, walletBalance: 7800 },
        'achieng': { id: 'u3', phone: '254734567890', username: 'Achieng_Dev', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', trustScore: 89, contractsCompleted: 9, winStreak: 0, walletBalance: 1200 },
        'kip': { id: 'u4', phone: '254745678901', username: 'Kip_Runner', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', trustScore: 99, contractsCompleted: 35, winStreak: 6, walletBalance: 15000 },
        'admin': { id: 'admin', phone: '254700000000', username: 'WekeleaAdmin', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', trustScore: 100, contractsCompleted: 0, winStreak: 0, walletBalance: 100000 }
      };
      const found = fallbackMapping[targetUsername.toLowerCase()];
      if (found) {
        setCurrentUser(found);
        localStorage.setItem('wekelea_user', JSON.stringify(found));
        setSelectedContract(null);
        setCurrentView('dashboard');
      }
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const activeTerms = newTermsList.filter(t => t.trim() !== '');
      if (activeTerms.length === 0) {
        alert('At least one verification condition must be filled.');
        return;
      }

      const contract = await WekeleaAPI.createContract({
        title: newTitle,
        category: newCategory,
        terms: activeTerms.join('; '),
        termsList: activeTerms,
        escrowAmount: Number(newEscrow),
        eventDate: newEventDate ? new Date(newEventDate).toISOString() : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        trustedSource: newTrustedSource,
        note: newNote,
        privacy: newPrivacy,
        creatorId: currentUser.id,
        counterpartyUsername: newCounterparty
      });

      // Clear fields
      setNewTitle('');
      setNewTerms('');
      setNewTermsList(['']);
      setNewEscrow('1000');
      setNewEventDate('');
      setNewTrustedSource('');
      setNewNote('');
      setNewCounterparty('');

      setSelectedContract(contract);
      setCurrentView('dashboard');
      setShowShareModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to create agreement');
    }
  };

  const handleAcceptContract = async (contractId: string) => {
    if (!currentUser) return;
    try {
      const updated = await WekeleaAPI.acceptContract(contractId, currentUser.id);
      setSelectedContract(updated);
    } catch (e: any) {
      alert(e.message || 'Error accepting agreement');
    }
  };

  // Payment triggers M-Pesa push simulation
  const handleMpesaDepositTrigger = async (contract: Contract) => {
    if (!currentUser) return;
    
    setMpesaPhone(currentUser.phone);
    setMpesaAmount(contract.escrowAmount);
    setShowMpesaPrompt(true);
  };

  const executeMpesaSTK = async () => {
    if (!currentUser) return;

    // Contract-funding flow when an agreement is open; otherwise a plain wallet top-up.
    const contractId = selectedContract?.id;
    const userId = currentUser.id;
    const amount = mpesaAmount;
    const balanceBefore = currentUser.walletBalance;

    setIsProcessingPayment(true);
    setMpesaError(null);
    setMpesaStatusMsg('Sending payment request…');

    // Once the wallet is credited: if funding an agreement, lock the funds into escrow.
    const finishFund = async () => {
      if (contractId) {
        const updated = await WekeleaAPI.fundContract(contractId, userId);
        setSelectedContract(updated);
      }
      const freshUser = await WekeleaAPI.getUser(userId);
      setCurrentUser(freshUser);
      localStorage.setItem('wekelea_user', JSON.stringify(freshUser));
      setIsProcessingPayment(false);
      setShowMpesaPrompt(false);
      setPendingCheckoutId(null);
      setMpesaStatusMsg(null);
    };

    try {
      const res = await WekeleaAPI.initiateSTKPush({ phone: mpesaPhone, amount, contractId: contractId || 'wallet_topup', userId });
      setPendingCheckoutId(res.CheckoutRequestID);

      if (res.simulated) {
        // Demo mode (no Daraja keys): auto-confirm the payment.
        setMpesaStatusMsg('Confirming payment…');
        setTimeout(async () => {
          try {
            await WekeleaAPI.triggerCallback(res.CheckoutRequestID, true);
            await finishFund();
          } catch (e: any) {
            setMpesaError('Confirmation failed: ' + e.message);
            setIsProcessingPayment(false);
          }
        }, 3000);
        return;
      }

      // REAL Daraja: the STK prompt is now on the user's phone. Safaricom will call
      // our callback when they enter their PIN; poll the wallet until it's credited.
      setMpesaStatusMsg(`Check your phone 📲 — enter your M-Pesa PIN to approve KES ${amount.toLocaleString()}.`);
      const target = balanceBefore + amount - 0.01;
      const deadline = Date.now() + 90000; // wait up to 90s for the callback
      const poll = async () => {
        try {
          const u = await WekeleaAPI.getUser(userId);
          if (u.walletBalance >= target) {
            setCurrentUser(u);
            await finishFund();
            return;
          }
        } catch { /* transient — keep polling */ }
        if (Date.now() > deadline) {
          setMpesaError('No confirmation received yet. If you approved on your phone, your wallet will update shortly — otherwise try again.');
          setIsProcessingPayment(false);
          setMpesaStatusMsg(null);
          return;
        }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 4000);
    } catch (err: any) {
      setMpesaError(err.message || 'M-Pesa STK request failed');
      setIsProcessingPayment(false);
      setMpesaStatusMsg(null);
    }
  };

  const handleRequestRelease = async (contractId: string) => {
    if (!currentUser) return;
    try {
      const updated = await WekeleaAPI.requestRelease(contractId, currentUser.id);
      setSelectedContract(updated);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleApproveSettle = async (contractId: string) => {
    if (!currentUser) return;
    if (!confirm('Approve release of the escrow? This will immediately release KES ' + selectedContract?.totalEscrow + ' (minus the 5% service fee) to the receiving party.')) return;
    try {
      const updated = await WekeleaAPI.approveRelease(contractId, currentUser.id);
      setSelectedContract(updated);
      
      const freshUser = await WekeleaAPI.getUser(currentUser.id);
      setCurrentUser(freshUser);
      localStorage.setItem('wekelea_user', JSON.stringify(freshUser));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDisputeClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedContract || !disputeReason) return;

    try {
      const updated = await WekeleaAPI.disputeRelease(selectedContract.id, currentUser.id, disputeReason);
      setSelectedContract(updated);
      setShowDisputeModal(false);
      setDisputeReason('');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleWithdrawFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !withdrawAmount) return;

    try {
      const res = await WekeleaAPI.withdraw(currentUser.id, Number(withdrawAmount));
      if (res.success) {
        setCurrentUser(res.user);
        localStorage.setItem('wekelea_user', JSON.stringify(res.user));
        setWithdrawAmount('');
        alert('Withdrawal request accepted! KES ' + withdrawAmount + ' successfully disbursed to M-Pesa wallet ' + res.user.phone);
        
        // Re-fetch transactions
        const freshTxs = await WekeleaAPI.getTransactions(currentUser.id);
        setTransactions(freshTxs);
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAdminResolve = async (disputeId: string, recipientId: string) => {
    if (!currentUser || currentUser.id !== 'admin' || !adminResolutionNotes) {
      alert('Resolution notes are required');
      return;
    }

    try {
      await WekeleaAPI.adminResolveDispute(disputeId, recipientId, adminResolutionNotes);
      alert('Dispute resolved. Escrow released to the receiving party.');
      setAdminResolutionNotes('');
      
      // Update local disputes
      const freshDisputes = await WekeleaAPI.getDisputes();
      setDisputes(freshDisputes);
      
      if (selectedContract) {
        const freshC = await WekeleaAPI.getContract(selectedContract.id);
        setSelectedContract(freshC);
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAdminRefund = async (disputeId: string) => {
    if (!currentUser || currentUser.id !== 'admin' || !adminResolutionNotes) {
      alert('Resolution notes are required');
      return;
    }

    try {
      await WekeleaAPI.adminRefundDispute(disputeId, adminResolutionNotes);
      alert('Escrow refunded fully to both parties. Dispute closed.');
      setAdminResolutionNotes('');
      
      // Update local disputes
      const freshDisputes = await WekeleaAPI.getDisputes();
      setDisputes(freshDisputes);

      if (selectedContract) {
        const freshC = await WekeleaAPI.getContract(selectedContract.id);
        setSelectedContract(freshC);
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleResetDatabase = async () => {
    if (!confirm('Reset all demo users, balances, disputes, and active contracts to default seeds?')) return;
    try {
      const res = await WekeleaAPI.resetDatabase();
      alert(res.message);
      window.location.reload();
    } catch (e) {
      alert('Reset failed');
    }
  };

  const copyShareLink = () => {
    if (!selectedContract) return;
    const shareUrl = `${window.location.origin}/?contractId=${selectedContract.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // --- SUB-VIEWS / HELPERS ---

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'AWAITING_ACCEPTANCE': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'AWAITING_FUNDING': return 'bg-orange-500/20 text-orange-400 border-orange-500/30 animate-pulse';
      case 'ACTIVE': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 vault-glow font-semibold';
      case 'CLAIMED': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'SETTLED': return 'bg-[#EC7505]/20 text-[#EC7505] border-[#EC7505]/30';
      case 'DISPUTED': return 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold';
      case 'REFUNDED': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  // Friendly, agreement-oriented labels for the internal state tokens.
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'Draft';
      case 'AWAITING_ACCEPTANCE': return 'Awaiting Acceptance';
      case 'AWAITING_FUNDING': return 'Awaiting Escrow Funding';
      case 'ACTIVE': return 'Active';
      case 'CLAIMED': return 'Release Requested';
      case 'SETTLED': return 'Completed';
      case 'DISPUTED': return 'In Dispute';
      case 'REFUNDED': return 'Refunded';
      default: return status;
    }
  };

  const getCategoryIcon = (category: AgreementCategory) => {
    switch (category) {
      case 'Creative Work': return '🎨';
      case 'Freelance': return '💼';
      case 'Personal Goal': return '🎯';
      case 'Fitness': return '💪';
      case 'Business': return '🏢';
      case 'Lending': return '🤲';
      case 'Marketplace': return '🛒';
      case 'Deliveries': return '📦';
      case 'Coaching': return '🧭';
      case 'Community': return '🌍';
      default: return '🤝';
    }
  };

  // Filtered contracts list for dashboard tab
  const getFilteredContracts = () => {
    return contracts.filter(c => {
      if (activeTab === 'active') {
        return c.status === 'ACTIVE' || c.status === 'CLAIMED' || c.status === 'DISPUTED';
      }
      if (activeTab === 'pending') {
        return c.status === 'AWAITING_ACCEPTANCE' || c.status === 'AWAITING_FUNDING';
      }
      return c.status === 'SETTLED' || c.status === 'REFUNDED';
    });
  };

  return (
    <>
      {showSplash && <ThreeDSplashScreen onComplete={() => setShowSplash(false)} />}
      <div className="w-full flex flex-col pt-4">
      
      {/* REAL-TIME NOTIFICATION BANNER */}
      {notificationBanner && (
        <div className="fixed top-4 left-4 right-4 z-50 glass-premium p-4 rounded-xl shadow-xl flex items-start space-x-3 border-emerald-500/50 animate-bounce cursor-pointer max-w-md mx-auto" onClick={() => setShowNotificationCenter(true)}>
          <span className="text-xl">🔔</span>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-[#EC7505]">{notificationBanner.title}</h4>
            <p className="text-xs text-gray-400">{notificationBanner.message}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setNotificationBanner(null); }} className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* FLOATING DEMO CONTROL CENTER (For instant developer pitch evaluation) */}
      <div className="fixed bottom-4 right-4 z-40 md:top-24 md:right-8 md:bottom-auto">
        <div className="glass p-3 rounded-2xl border-yellow-500/30 flex flex-col space-y-2 shadow-2xl">
          <div className="flex items-center space-x-1.5 border-b border-white/10 pb-1.5">
            <Sliders size={14} className="text-[#D4AF37]" />
            <span className="text-[10px] font-bold tracking-wider text-gray-300">DEMO PANEL</span>
          </div>
          
          <div className="flex flex-col space-y-1">
            <span className="text-[9px] text-gray-400">Jump Profiles:</span>
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => handleSwitchUser('MwangiEscrow')} className={`text-[10px] px-1.5 py-1 rounded transition ${currentUser?.username === 'MwangiEscrow' ? 'bg-[#EC7505]/20 text-[#EC7505] font-bold border border-[#EC7505]/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                Mwangi
              </button>
              <button onClick={() => handleSwitchUser('Mwende_Vibe')} className={`text-[10px] px-1.5 py-1 rounded transition ${currentUser?.username === 'Mwende_Vibe' ? 'bg-[#EC7505]/20 text-[#EC7505] font-bold border border-[#EC7505]/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                Mwende
              </button>
              <button onClick={() => handleSwitchUser('Achieng_Dev')} className={`text-[10px] px-1.5 py-1 rounded transition ${currentUser?.username === 'Achieng_Dev' ? 'bg-[#EC7505]/20 text-[#EC7505] font-bold border border-[#EC7505]/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                Achieng
              </button>
              <button onClick={() => handleSwitchUser('Kip_Runner')} className={`text-[10px] px-1.5 py-1 rounded transition ${currentUser?.username === 'Kip_Runner' ? 'bg-[#EC7505]/20 text-[#EC7505] font-bold border border-[#EC7505]/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                Kip
              </button>
            </div>
            <button onClick={() => handleSwitchUser('WekeleaAdmin')} className={`text-[10px] py-1 mt-1 rounded transition w-full ${currentUser?.username === 'WekeleaAdmin' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'bg-white/5 text-amber-500 hover:bg-amber-500/10'}`}>
              👑 Admin View
            </button>
            <button onClick={handleResetDatabase} className="text-[10px] bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/30 py-1 mt-1 rounded transition w-full flex items-center justify-center space-x-1">
              <RefreshCw size={10} />
              <span>Reset Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* --- SCREEN 1: LANDING PAGE --- */}
      {currentView === 'landing' && (
        <div className="flex flex-col space-y-8 py-6">
          {/* Logo & Headline */}
          <div className="flex flex-col items-center text-center space-y-5 pt-8">
            <img src="/assets/logo.png" alt="Wekelea Brand Logo" className="w-24 h-24 object-contain drop-shadow-[0_0_20px_rgba(236,117,5,0.45)]" />
            <div className="flex items-center space-x-3 text-2xl font-black uppercase tracking-wider text-white">
              <span>Wekelea</span>
            </div>
            <div className="kenya-accent w-32 rounded" />
            <h1 className="text-4xl font-extrabold tracking-tight pt-2 leading-none">
              Make every agreement <br />
              <span className="text-[#EC7505] bg-clip-text">enforceable.</span>
            </h1>
            <p className="text-gray-400 text-sm max-w-sm">
              Wekelea securely holds funds in escrow and releases them only when the agreed conditions are met — for freelance work, personal goals, business deals and more. Fast, peer-to-peer, and secure.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col space-y-3 px-4 pt-4">
            <button 
              id="cta-join-now"
              onClick={() => {
                if (currentUser) {
                  setCurrentView('dashboard');
                } else {
                  setShowLoginModal(true);
                }
              }}
              className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-4 px-6 rounded-2xl shadow-lg transition flex items-center justify-center space-x-2 text-lg active:scale-95"
            >
              <ShieldCheck size={22} />
              <span>Launch App & Create Agreement</span>
            </button>

            <button 
              id="cta-how-it-works"
              onClick={() => {
                const el = document.getElementById('how-it-works-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full glass hover:bg-white/5 py-4 px-6 rounded-2xl text-gray-300 font-semibold transition text-sm active:scale-95"
            >
              How Wekelea Escrow Works
            </button>
          </div>

          {/* Product Principles Grid */}
          <div className="grid grid-cols-2 gap-4 px-2 pt-4">
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">🤝</span>
              <h3 className="font-bold text-sm">P2P Escrow</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Mutual agreements. Funds stay fully secured inside an independent escrow ledger.</p>
            </div>
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">🟢</span>
              <h3 className="font-bold text-sm">M-Pesa Native</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Instant STK push deposits and seamless instant cashouts direct to Kenyan wallets.</p>
            </div>
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">🔬</span>
              <h3 className="font-bold text-sm">100% Verifiable</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Only objective, verifiable conditions. Clear criteria ensure fair, unambiguous release.</p>
            </div>
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">⚖️</span>
              <h3 className="font-bold text-sm">Dispute Safe</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Neutral arbitration. Escrow freezes and relies on trust logs and evidence if parties disagree.</p>
            </div>
          </div>

          {/* Live Public Agreements Feed */}
          <div className="glass p-5 rounded-3xl border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-white text-sm flex items-center space-x-1.5">
                <Globe size={16} className="text-[#EC7505]" />
                <span>Live Open Agreements</span>
              </h3>
              <span className="flex items-center space-x-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <span>Live</span>
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">
              Open agreements awaiting another party. Sign in to accept one and fund the escrow.
            </p>

            {(() => {
              const openAgreements = contracts
                .filter((c) => c.privacy === 'Public' && ['DRAFT', 'AWAITING_ACCEPTANCE', 'AWAITING_FUNDING'].includes(c.status))
                .slice(0, 5);

              if (openAgreements.length === 0) {
                return (
                  <div className="bg-black/20 rounded-xl p-6 text-center border border-white/5">
                    <span className="text-2xl block mb-1">🕊️</span>
                    <p className="text-[11px] text-gray-500">No open public agreements right now. Be the first — launch the app and create one.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {openAgreements.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPendingContractId(c.id);
                        setShowLoginModal(true);
                      }}
                      className="w-full bg-black/20 hover:bg-white/5 rounded-xl p-3 border border-white/5 flex items-center justify-between text-left transition active:scale-[0.99]"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="text-lg flex-shrink-0">{getCategoryIcon(c.category)}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{c.title}</p>
                          <p className="text-[10px] text-gray-500">{c.category} · escrow KES {c.escrowAmount.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 pl-2">
                        <span className="text-[11px] font-black text-[#EC7505]">KES {c.totalEscrow.toLocaleString()}</span>
                        <span className="text-[9px] text-gray-500 uppercase">in escrow</span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Legal / Policy Section */}
          <div id="how-it-works-section" className="glass p-5 rounded-2xl border-white/5 space-y-4 mt-8">
            <h3 className="font-extrabold text-white text-lg flex items-center space-x-1.5">
              <span>⚖️</span>
              <span>Wekelea Trust & Escrow Rules</span>
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Wekelea is a <strong>peer-to-peer escrow platform for agreements</strong>. We securely hold funds for two consenting parties and release them only when agreed conditions are verified. The platform generates no odds, takes no position, and enforces that agreements reference only objective, verifiable conditions.
            </p>
            <div className="grid grid-cols-2 gap-3 text-[10px] pt-2">
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>Strictly 18+ platform restrictions</span>
              </div>
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>Mutual conditions & dual release approvals</span>
              </div>
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>Secure manual dispute evidence review</span>
              </div>
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>5% service fee on escrow release</span>
              </div>
            </div>
            <div className="text-[10px] text-gray-400 border-t border-white/5 pt-3">
              By using our platform, you accept our <button onClick={() => setLegalModal('terms')} className="text-[#D4AF37] underline hover:text-[#EC7505] transition">Terms of Service</button>, <button onClick={() => setLegalModal('privacy')} className="text-[#D4AF37] underline hover:text-[#EC7505] transition">Privacy Policy</button>, and strict <button onClick={() => setLegalModal('responsible')} className="text-[#D4AF37] underline hover:text-[#EC7505] transition">Responsible Use Policy</button>.
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-gray-500 py-6 border-t border-white/5">
            © 2026 Wekelea Escrow Platform. Nairobi, Kenya. All rights reserved.
          </div>
        </div>
      )}

      {/* --- SCREEN 2: LOGIN / REGISTER MODAL --- */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-premium p-6 w-full max-w-sm rounded-3xl shadow-2xl border-white/10 relative">
            <button 
              id="close-login-modal"
              onClick={() => { setShowLoginModal(false); setIsOtpStep(false); }} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-2 mb-6">
              <span className="text-3xl">🔑</span>
              <h2 className="text-2xl font-black text-white">
                {isOtpStep ? 'Verify OTP Code' : 'Welcome to Wekelea'}
              </h2>
              <p className="text-xs text-gray-400">
                {isOtpStep 
                  ? 'We simulated sending a 4-digit code via SMS.' 
                  : 'Enter your phone number to sign up or log in instantly.'}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {!isOtpStep ? (
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">M-Pesa Phone Number</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-sm text-gray-400">+254</span>
                    <input 
                      id="login-phone-input"
                      type="tel" 
                      placeholder="712345678" 
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="input-field pl-14"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 block mt-1">Requires an active M-Pesa account.</span>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1">Simulated 4-Digit PIN</label>
                  <input 
                    id="login-otp-input"
                    type="text" 
                    placeholder="1234" 
                    maxLength={4}
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value)}
                    className="input-field text-center tracking-widest text-lg font-bold"
                    required
                  />
                  <span className="text-[10px] text-emerald-400 block mt-1 text-center font-medium">Demo Mode: Type any 4 digits to authenticate.</span>
                </div>
              )}

              <button 
                id="login-submit-btn"
                type="submit" 
                className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-3 px-4 rounded-xl shadow-lg transition active:scale-95 text-sm uppercase tracking-wider"
              >
                {isOtpStep ? 'Confirm Verification' : 'Get Started'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* LEGAL POLICY MODAL (Terms / Privacy / Responsible Use) — top-level so it works pre-login */}
      {legalModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLegalModal(null)}>
          <div className="glass-premium p-6 w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl border-white/10 shadow-2xl relative space-y-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLegalModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={20} />
            </button>
            {(() => {
              const content = {
                terms: {
                  title: 'Terms of Service',
                  icon: '📜',
                  body: [
                    'Wekelea provides a peer-to-peer escrow facility only. We are not a party to, or a guarantor of, any agreement between users.',
                    'Users must be 18 years or older and legally permitted to enter binding agreements in their jurisdiction.',
                    'An agreement becomes active only when the participants have accepted the terms and funded the escrow. Funds are held in escrow until the conditions are verified or a dispute is resolved by an arbiter.',
                    'A 5% service fee is deducted from the escrow on release. No fee is charged on a full dispute refund.',
                    'Agreements must be based on objective, verifiable conditions. Wekelea reserves the right to freeze or refund agreements that violate these terms.',
                  ],
                },
                privacy: {
                  title: 'Privacy Policy',
                  icon: '🔒',
                  body: [
                    'We collect only the data required to operate the escrow service: your phone number, username, wallet balance, and agreement history.',
                    'Your phone number is used for authentication and M-Pesa settlement. It is never sold or shared with third parties for marketing.',
                    'Agreement details are visible to the parties involved and, for public agreements, to other users browsing the open feed.',
                    'Transaction and audit logs are retained for dispute resolution and regulatory compliance.',
                    'You may request export or deletion of your account data at any time by contacting support.',
                  ],
                },
                responsible: {
                  title: 'Responsible Use Policy',
                  icon: '⚖️',
                  body: [
                    'Wekelea is infrastructure for enforcing agreements between consenting adults — not a gambling product. There are no odds, no house position, and no automated betting.',
                    'Only commit funds you are prepared to place in escrow. Escrowed funds are locked until conditions are verified and cannot be recalled unilaterally.',
                    'Agreements must reference clear, objective, verifiable conditions. Ambiguous or unverifiable terms may be refunded by an arbiter.',
                    'Harassment, coercion, or fraudulent release requests will result in account suspension and loss of standing.',
                    'Use Wekelea responsibly. If a commitment feels beyond your means, do not fund it. Support resources are available on request.',
                  ],
                },
              }[legalModal];
              return (
                <>
                  <div className="text-center space-y-1 pt-1">
                    <span className="text-3xl">{content.icon}</span>
                    <h3 className="text-xl font-black text-white">{content.title}</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Wekelea Escrow Platform · Nairobi, Kenya</p>
                  </div>
                  <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
                    {content.body.map((para, i) => (
                      <p key={i} className="flex space-x-2">
                        <span className="text-[#EC7505] font-bold flex-shrink-0">{i + 1}.</span>
                        <span>{para}</span>
                      </p>
                    ))}
                  </div>
                  <button onClick={() => setLegalModal(null)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-3 px-4 rounded-xl transition text-xs uppercase tracking-wider active:scale-95">
                    I Understand
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* --- APP HEADER (Available once logged in) --- */}
      {currentUser && (
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex justify-between items-center">
            {/* User Profile Summary */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentView('wallet')}>
              <img src={currentUser.avatar} alt="Avatar" className="w-10 h-10 rounded-full border border-white/10 bg-white/5" />
              <div>
                <h3 className="font-extrabold text-sm text-white flex items-center space-x-1">
                  <span>@{currentUser.username}</span>
                  {currentUser.trustScore >= 95 && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500/30">Verified Gold</span>}
                </h3>
                <p className="text-[10px] text-gray-400">
                  🏆 {currentUser.contractsCompleted} Settled • Streak: {currentUser.winStreak}🔥
                </p>
              </div>
            </div>

            {/* In-app action tray */}
            <div className="flex items-center space-x-2">
              {/* Notification Badge */}
              <button 
                id="bell-icon-btn"
                onClick={() => {
                  setShowNotificationCenter(!showNotificationCenter);
                  WekeleaAPI.markNotificationsRead(currentUser.id).catch(console.error);
                }}
                className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 relative border border-white/5 transition"
              >
                <Bell size={18} />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-[#0d0d0f]" />
                )}
              </button>

              <button 
                id="logout-btn"
                onClick={handleLogout} 
                className="text-xs font-semibold px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 hover:text-white transition"
              >
                Exit App
              </button>
            </div>
          </div>

          {/* Kenya flag line */}
          <div className="kenya-accent w-full h-1 rounded" />

          {/* Quick Wallet Bar */}
          <div className="glass p-4 rounded-2xl flex justify-between items-center border-white/5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Escrow Balance</span>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-2xl font-black text-white">KES {currentUser.walletBalance.toLocaleString()}</span>
                <span className="text-xs text-[#EC7505] font-semibold">Available</span>
              </div>
            </div>
            <div className="flex space-x-2">
              <button 
                id="deposit-wallet-btn"
                onClick={() => {
                  setMpesaPhone(currentUser.phone);
                  setMpesaAmount(1000); // Default deposit demo
                  setPendingCheckoutId(null);
                  setMpesaError(null);
                  setShowMpesaPrompt(true);
                }}
                className="bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center space-x-1 transition text-white"
              >
                <ArrowDownLeft size={14} className="text-emerald-400" />
                <span>Deposit</span>
              </button>
              <button 
                id="withdraw-wallet-btn"
                onClick={() => setCurrentView('wallet')}
                className="bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center space-x-1 transition text-white"
              >
                <ArrowUpRight size={14} className="text-[#D4AF37]" />
                <span>Cashout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NOTIFICATION CENTER PANEL OVERLAY --- */}
      {showNotificationCenter && currentUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-sm bg-[#121214] border-l border-white/10 h-full p-6 overflow-y-auto flex flex-col space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h2 className="text-xl font-black text-white flex items-center space-x-2">
                <Bell size={20} className="text-[#EC7505]" />
                <span>Activity Feed</span>
              </h2>
              <button 
                id="close-notif-btn"
                onClick={() => setShowNotificationCenter(false)} 
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 flex flex-col space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-xs">
                  No notifications yet. Create an agreement to see updates.
                </div>
              ) : (
                notifications.map((note) => (
                  <div key={note.id} className={`p-4 rounded-xl border flex items-start space-x-3 transition cursor-pointer ${note.read ? 'bg-white/5 border-white/5 text-gray-400' : 'bg-[#EC7505]/5 border-[#EC7505]/20 text-white font-medium'}`} onClick={async () => {
                    if (note.contractId) {
                      try {
                        const targetContract = await WekeleaAPI.getContract(note.contractId);
                        setSelectedContract(targetContract);
                        setShowNotificationCenter(false);
                        setCurrentView('dashboard');
                      } catch (e) {
                        console.error(e);
                      }
                    }
                  }}>
                    <span className="text-lg mt-0.5">
                      {note.type === 'CONTRACT_INVITE' ? '🤝' : 
                       note.type === 'CONTRACT_ACTIVE' ? '🔒' :
                       note.type === 'CLAIM_MADE' ? '⚠️' : 
                       note.type === 'DISPUTE_OPENED' ? '⚖️' : '🔔'}
                    </span>
                    <div className="flex-1 space-y-1">
                      <h4 className="text-xs font-bold text-white leading-tight">{note.title}</h4>
                      <p className="text-[11px] text-gray-400 leading-snug">{note.message}</p>
                      <span className="text-[9px] text-gray-500 block pt-1">
                        {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- SCREEN 3: APP MAIN DASHBOARD --- */}
      {currentView === 'dashboard' && currentUser && (
        <div className="flex flex-col space-y-6">
          
          {/* Quick Create Agreement CTA */}
          <div className="flex justify-between items-center pt-2">
            <h2 className="text-lg font-black text-white flex items-center space-x-2">
              <span>💼</span>
              <span>My Escrow Agreements</span>
            </h2>
            <button 
              id="dashboard-new-contract-btn"
              onClick={() => setCurrentView('create-contract')}
              className="bg-[#EC7505] hover:bg-[#D84A05] text-black font-black text-xs py-2 px-3 rounded-xl flex items-center space-x-1 shadow transition active:scale-95"
            >
              <Plus size={14} />
              <span>Create Agreement</span>
            </button>
          </div>

          {/* TAB SELECTION */}
          <div className="flex border-b border-white/10 p-0.5">
            <button 
              id="tab-active-btn"
              onClick={() => setActiveTab('active')} 
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${activeTab === 'active' ? 'border-[#EC7505] text-[#EC7505]' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              Active Escrows
            </button>
            <button 
              id="tab-pending-btn"
              onClick={() => setActiveTab('pending')} 
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${activeTab === 'pending' ? 'border-[#EC7505] text-[#EC7505]' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              Invites & Funding
            </button>
            <button 
              id="tab-completed-btn"
              onClick={() => setActiveTab('completed')} 
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition ${activeTab === 'completed' ? 'border-[#EC7505] text-[#EC7505]' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              History
            </button>
          </div>

          {/* CONTRACTS SCROLL LIST */}
          <div className="flex flex-col space-y-4">
            {getFilteredContracts().length === 0 ? (
              <div className="glass p-12 text-center rounded-2xl border-white/5 space-y-3">
                <span className="text-3xl block">📋</span>
                <p className="text-xs text-gray-400 font-semibold">No agreements found in this section.</p>
                {activeTab === 'pending' && (
                  <button onClick={() => setCurrentView('create-contract')} className="text-xs text-[#EC7505] underline font-bold">
                    Create your first agreement now!
                  </button>
                )}
              </div>
            ) : (
              getFilteredContracts().map((contract) => (
                <div key={contract.id} className="glass glass-interactive p-5 rounded-3xl flex flex-col space-y-4 border-white/5 cursor-pointer relative" onClick={() => setSelectedContract(contract)}>
                  
                  {/* Category, Title, Expiry */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs px-2 py-1 rounded bg-white/5 font-semibold text-gray-300">
                        {getCategoryIcon(contract.category)} {contract.category}
                      </span>
                      {contract.privacy === 'Private' && (
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center space-x-0.5">
                          <Lock size={10} />
                          <span>Private Link</span>
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold ${getStatusBadgeClass(contract.status)}`}>
                      {contract.status === 'SETTLED' ? '💰 SETTLED' : 
                       contract.status === 'ACTIVE' ? '🔒 ACTIVE' : contract.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-extrabold text-lg text-white leading-tight">{contract.title}</h3>
                    <p className="text-xs text-gray-400 leading-snug line-clamp-2">{contract.terms}</p>
                  </div>

                  {/* Escrow breakdown */}
                  <div className="flex justify-between items-center pt-3 border-t border-white/5">
                    <div className="flex items-baseline space-x-1">
                      <span className="text-[#EC7505] font-black text-base">KES {contract.escrowAmount.toLocaleString()}</span>
                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">each</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-500 block">Total in Escrow</span>
                      <span className="font-extrabold text-sm text-white">KES {contract.totalEscrow.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Expiring Alert if Awaiting Acceptance/Funding */}
                  {(contract.status === 'AWAITING_ACCEPTANCE' || contract.status === 'AWAITING_FUNDING') && (
                    <div className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 p-2 rounded-lg flex items-center space-x-1.5">
                      <Clock size={12} className="flex-shrink-0" />
                      <span>Settlement deadline: {new Date(contract.settlementDeadline).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* DYNAMIC SELECTED CONTRACT VIEW MODAL (Screen 5, 8, 9, 10 Combined) */}
          {selectedContract && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
              <div className="glass-premium p-6 w-full max-w-md rounded-3xl shadow-2xl border-white/10 relative my-8 space-y-6">
                
                {/* Modal close */}
                <button 
                  id="close-contract-details-modal"
                  onClick={() => setSelectedContract(null)} 
                  className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition"
                >
                  <X size={20} />
                </button>

                {/* Status Indicator */}
                <div className="flex flex-col items-center text-center space-y-2 border-b border-white/10 pb-4">
                  <span className={`text-[10px] px-3 py-1 rounded-full border uppercase tracking-wider font-extrabold ${getStatusBadgeClass(selectedContract.status)}`}>
                    {getStatusLabel(selectedContract.status)}
                  </span>

                  {selectedContract.status === 'ACTIVE' && (
                    <div className="flex items-center space-x-1 text-xs text-[#EC7505] font-bold bg-[#EC7505]/10 py-1 px-2.5 rounded-full border border-[#EC7505]/20 animate-pulse">
                      <Lock size={12} />
                      <span>KES {selectedContract.totalEscrow.toLocaleString()} HELD IN ESCROW</span>
                    </div>
                  )}

                  <h2 className="text-2xl font-black text-white leading-tight pt-1">{selectedContract.title}</h2>
                  <span className="text-xs text-gray-400">{getCategoryIcon(selectedContract.category)} {selectedContract.category}</span>
                </div>

                {/* Terms Breakdown */}
                <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
                  <h4 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Objective Terms</h4>
                  <p className="text-xs text-gray-200 leading-relaxed font-mono">{selectedContract.terms}</p>
                  
                  {selectedContract.trustedSource && (
                    <a href={selectedContract.trustedSource} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 hover:text-[#EC7505] flex items-center space-x-1 pt-1 underline">
                      <ExternalLink size={10} />
                      <span>Verification Source Link</span>
                    </a>
                  )}
                </div>

                {/* Participant Escrow Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass p-3 rounded-xl border-white/5 flex flex-col space-y-1">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Creator Escrow</span>
                    <span className="text-xs font-bold text-white">KES {selectedContract.escrowAmount.toLocaleString()}</span>
                    <span className={`text-[10px] font-semibold flex items-center space-x-1 ${selectedContract.creatorStatus === 'FUNDED' ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {selectedContract.creatorStatus === 'FUNDED' ? '✅ Funded' : '⏳ Awaiting Funding'}
                    </span>
                  </div>

                  <div className="glass p-3 rounded-xl border-white/5 flex flex-col space-y-1">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Other Party Escrow</span>
                    <span className="text-xs font-bold text-white">KES {selectedContract.escrowAmount.toLocaleString()}</span>
                    <span className={`text-[10px] font-semibold flex items-center space-x-1 ${selectedContract.counterpartyStatus === 'FUNDED' ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {selectedContract.counterpartyId 
                        ? (selectedContract.counterpartyStatus === 'FUNDED' ? '✅ Funded' : '⏳ Awaiting Funding')
                        : '⏳ Pending Accept'}
                    </span>
                  </div>
                </div>

                {/* Expiration Details */}
                <div className="text-xs text-gray-400 space-y-1 pt-2 border-t border-white/5">
                  <div className="flex justify-between">
                    <span>Settlement Deadline:</span>
                    <span className="font-bold text-white">{new Date(selectedContract.settlementDeadline).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Agreement Created:</span>
                    <span>{new Date(selectedContract.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Note Card */}
                {selectedContract.note && (
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-start space-x-2">
                    <MessageSquare size={14} className="text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Note</span>
                      <p className="text-xs text-gray-300 italic">“{selectedContract.note}”</p>
                    </div>
                  </div>
                )}

                {/* ACTION ROUTER ACCORDING TO STATE AND USER PERSPECTIVE */}
                <div className="space-y-3 pt-4">

                  {/* 1. AGREEMENT AWAITING ACCEPTANCE (other party vs creator view) */}
                  {selectedContract.status === 'AWAITING_ACCEPTANCE' && (
                    <>
                      {selectedContract.creatorId === currentUser.id ? (
                        <div className="text-center py-2">
                          <p className="text-xs text-yellow-400 mb-3 font-semibold">Awaiting acceptance by the other party.</p>
                          <button onClick={() => setShowShareModal(true)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-1 shadow transition">
                            <Share2 size={16} />
                            <span>Share Invitation Link</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 bg-[#EC7505]/5 border border-[#EC7505]/20 p-4 rounded-2xl">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Accept Agreement Terms</h4>
                          <div className="flex items-start space-x-2 mb-3">
                            <input type="checkbox" id="terms-confirm-box" className="custom-checkbox mt-0.5" defaultChecked />
                            <label htmlFor="terms-confirm-box" className="text-[10px] text-gray-300 leading-snug">
                              I confirm that the terms above are <strong>objectively verifiable</strong> and represent our agreement. I understand both parties must fund the escrow to activate the agreement.
                            </label>
                          </div>
                          <button onClick={() => handleAcceptContract(selectedContract.id)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-3 px-4 rounded-xl shadow transition">
                            Accept Agreement Terms
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* 2. CONTRACT AWAITING FUNDING */}
                  {selectedContract.status === 'AWAITING_FUNDING' && (
                    <div className="space-y-3">
                      {/* Check if current user is the one who needs to fund */}
                      {((selectedContract.creatorId === currentUser.id && selectedContract.creatorStatus === 'PENDING_FUND') ||
                        (selectedContract.counterpartyId === currentUser.id && selectedContract.counterpartyStatus === 'PENDING_FUND')) ? (
                        <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl space-y-3 text-center">
                          <p className="text-xs text-orange-400 font-semibold">Your escrow of KES {selectedContract.escrowAmount.toLocaleString()} is due to activate the agreement.</p>
                          <button onClick={() => handleMpesaDepositTrigger(selectedContract)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-black py-3 px-4 rounded-xl flex items-center justify-center space-x-1.5 shadow transition">
                            <Wallet size={16} />
                            <span>Fund Escrow via M-Pesa STK</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center py-3 text-xs text-gray-400 glass rounded-2xl border-white/5">
                          ⏳ Funded! Awaiting the other party to fund the escrow.
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. CONTRACT IS ACTIVE (Countdowns & Claim triggers) */}
                  {selectedContract.status === 'ACTIVE' && (() => {
                    const termsListToRender = selectedContract.termsList && selectedContract.termsList.length > 0
                      ? selectedContract.termsList
                      : [selectedContract.terms];
                    
                    const totalCount = termsListToRender.filter(t => t.trim() !== '').length;
                    const checkedCount = Object.keys(claimChecklist).filter(key => claimChecklist[Number(key)]).length;
                    const isAllChecked = checkedCount === totalCount;

                    return (
                      <div className="space-y-4">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-extrabold text-[#EC7505] uppercase tracking-wider">Verify Conditions Met</h4>
                            <span className="text-[10px] bg-[#EC7505]/20 text-[#EC7505] font-bold px-2 py-0.5 rounded border border-[#EC7505]/30">
                              {checkedCount}/{totalCount} Met
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">Check off each condition that has been met to request release of the escrow:</p>
                          
                          <div className="space-y-2 pt-1">
                            {termsListToRender.map((term, index) => (
                              <label key={index} className="flex items-start space-x-3 cursor-pointer text-xs text-gray-200 bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/5 transition">
                                <input 
                                  type="checkbox"
                                  checked={!!claimChecklist[index]}
                                  onChange={(e) => {
                                    setClaimChecklist({
                                      ...claimChecklist,
                                      [index]: e.target.checked
                                    });
                                  }}
                                  className="mt-0.5 accent-[#EC7505]"
                                />
                                <span className="leading-snug">{term}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <button 
                          disabled={!isAllChecked}
                          onClick={() => {
                            handleRequestRelease(selectedContract.id);
                            setClaimChecklist({});
                          }}
                          className={`w-full font-extrabold py-3.5 px-4 rounded-xl shadow transition text-sm uppercase tracking-wider flex items-center justify-center space-x-2 ${isAllChecked ? 'bg-[#EC7505] hover:bg-[#D84A05] text-black active:scale-95' : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'}`}
                        >
                          <Award size={18} />
                          <span>Confirm Conditions Met & Request Release</span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* 4. CLAIM IN PROCESS */}
                  {selectedContract.status === 'CLAIMED' && (
                    <div className="space-y-3">
                      {selectedContract.requestedById === currentUser.id ? (
                        <div className="text-center py-3 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
                          ⏳ Release requested! Awaiting the other party&apos;s approval.
                        </div>
                      ) : (() => {
                        const termsListToRender = selectedContract.termsList && selectedContract.termsList.length > 0
                          ? selectedContract.termsList
                          : [selectedContract.terms];
                        
                        const totalCount = termsListToRender.filter(t => t.trim() !== '').length;
                        const checkedCount = Object.keys(settleChecklist).filter(key => settleChecklist[Number(key)]).length;
                        const isAllChecked = checkedCount === totalCount;

                        return (
                          <div className="bg-[#EC7505]/5 border border-white/10 p-4 rounded-2xl space-y-4">
                            <div className="text-center space-y-1">
                              <span className="text-xs text-gray-400 block font-semibold">The other party marked the conditions as met.</span>
                              <span className="text-sm font-bold text-white">Do you approve releasing the escrow?</span>
                              <p className="text-[10px] text-gray-400 mt-1">Verify that each condition was met by checking them off before releasing the escrow:</p>
                            </div>
                            
                            <div className="space-y-2 border-t border-b border-white/5 py-3">
                              {termsListToRender.map((term, index) => (
                                <label key={index} className="flex items-start space-x-3 cursor-pointer text-xs text-gray-200 bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/5 transition">
                                  <input 
                                    type="checkbox"
                                    checked={!!settleChecklist[index]}
                                    onChange={(e) => {
                                      setSettleChecklist({
                                        ...settleChecklist,
                                        [index]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 accent-[#EC7505]"
                                  />
                                  <span className="leading-snug">{term}</span>
                                </label>
                              ))}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <button 
                                disabled={!isAllChecked}
                                onClick={() => {
                                  handleApproveSettle(selectedContract.id);
                                  setSettleChecklist({});
                                }}
                                className={`font-black py-3 rounded-xl shadow transition text-xs flex items-center justify-center space-x-1 ${isAllChecked ? 'bg-[#EC7505] hover:bg-[#D84A05] text-black active:scale-95' : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'}`}
                              >
                                <Check size={14} />
                                <span>Approve &amp; Release</span>
                              </button>
                              <button onClick={() => setShowDisputeModal(true)} className="bg-red-500/10 hover:bg-red-500/20 text-rose-400 border border-rose-500/30 font-bold py-3 rounded-xl transition text-xs flex items-center justify-center space-x-1">
                                <X size={14} />
                                <span>Reject & Dispute</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 5. DISPUTED CONTRACT VIEW */}
                  {selectedContract.status === 'DISPUTED' && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl space-y-2">
                      <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
                        <AlertTriangle size={16} />
                        <span>Arbitration Active</span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-normal">
                        Release not approved. Escrow is frozen. A Wekelea admin is reviewing the evidence timeline. Restore ratings by sending verification links.
                      </p>
                      
                      {currentUser.id === 'admin' && (
                        <button onClick={() => { setSelectedContract(null); setCurrentView('admin'); }} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-black py-2.5 px-4 mt-2 rounded-xl text-xs flex items-center justify-center space-x-1 shadow transition">
                          <Scale size={14} />
                          <span>Moderate Dispute Case</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 6. SETTLED STATE */}
                  {selectedContract.status === 'SETTLED' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl space-y-1.5 text-center">
                      <div className="flex items-center justify-center space-x-1.5 text-emerald-400 font-bold text-sm">
                        <CheckCircle2 size={16} />
                        <span>Escrow released!</span>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Escrow of KES {selectedContract.totalEscrow.toLocaleString()} released to the receiving party. (Wekelea 5% service fee deducted).
                      </p>
                    </div>
                  )}

                  {/* 7. REFUNDED STATE */}
                  {selectedContract.status === 'REFUNDED' && (
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl text-center">
                      <p className="text-xs text-purple-400 font-semibold">Admin Refund Executed.</p>
                      <p className="text-[10px] text-gray-400 mt-1">Full escrow of KES {selectedContract.escrowAmount.toLocaleString()} credited back to both participants&apos; wallets.</p>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* DYNAMIC DISPUTE REJECTION REASON MODAL */}
          {showDisputeModal && selectedContract && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
              <div className="glass-premium p-6 w-full max-w-sm rounded-3xl border-white/10 shadow-2xl space-y-4">
                <div className="text-center space-y-1">
                  <h3 className="text-lg font-black text-white">Trigger Formal Dispute</h3>
                  <p className="text-xs text-gray-400">Specify why the claim is inaccurate. Your trust score will be suspended during review.</p>
                </div>
                
                <form onSubmit={handleDisputeClaimSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Dispute Reason</label>
                    <textarea 
                      id="dispute-reason-input"
                      rows={3} 
                      placeholder="Specify timing discrepancies, overlay Timer issue, or results error..."
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      className="input-field text-xs resize-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition">
                      File Dispute
                    </button>
                    <button type="button" onClick={() => setShowDisputeModal(false)} className="bg-white/5 hover:bg-white/10 text-gray-300 font-semibold py-2.5 rounded-xl text-xs transition">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* DYNAMIC SHARE CONTRACT DETAILS MODAL (QR, Links, etc) */}
          {showShareModal && selectedContract && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="glass-premium p-6 w-full max-w-sm rounded-3xl border-white/10 shadow-2xl relative space-y-6">
                <button onClick={() => setShowShareModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                  <X size={20} />
                </button>

                <div className="text-center space-y-1">
                  <span className="text-2xl">🤝</span>
                  <h3 className="text-xl font-black text-white">Agreement Shared!</h3>
                  <p className="text-xs text-gray-400">Send this link to the other party. Once they accept the terms, escrow funding activates.</p>
                </div>

                {/* Scannable QR Code encoding the invite link */}
                <div className="flex flex-col items-center p-4 bg-white rounded-2xl w-44 h-44 mx-auto relative justify-center shadow-lg">
                  <QRCodeSVG
                    value={`${window.location.origin}/?contractId=${selectedContract.id}`}
                    size={144}
                    level="M"
                    marginSize={0}
                    fgColor="#0d0d0f"
                    bgColor="#ffffff"
                    imageSettings={{
                      src: '/assets/logo.png',
                      height: 30,
                      width: 30,
                      excavate: true,
                    }}
                  />
                </div>

                {/* Action button */}
                <div className="space-y-3">
                  <button onClick={copyShareLink} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-1.5 shadow active:scale-95 text-xs uppercase tracking-wider">
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedLink ? 'Copied to Clipboard!' : 'Copy Invitation Link'}</span>
                  </button>

                  <a href={`https://wa.me/?text=${encodeURIComponent(`Join my escrow agreement on Wekelea: "${selectedContract.title}" with an escrow of KES ${selectedContract.escrowAmount}. Link: ${window.location.origin}/?contractId=${selectedContract.id}`)}`} target="_blank" rel="noopener noreferrer" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-1.5 shadow active:scale-95 text-xs uppercase tracking-wider">
                    <span>📱 Share via WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* SIMULATED SAFARICOM M-PESA STK PUSH DIALOG */}
          {showMpesaPrompt && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
              <div className="bg-[#E9EBEE] text-[#1c1d1f] w-full max-w-xs rounded-2xl p-5 shadow-2xl relative space-y-4 border-2 border-white/50">
                
                {/* Safaricom Header */}
                <div className="flex justify-between items-center border-b border-gray-300 pb-2">
                  <div className="flex items-center space-x-1">
                    <span className="w-3.5 h-3.5 bg-emerald-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">M</span>
                    <span className="text-xs font-black uppercase text-emerald-600 tracking-wider">M-Pesa STK Push</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-semibold">Secure</span>
                </div>

                {isProcessingPayment ? (
                  <div className="py-6 flex flex-col items-center space-y-4 text-center">
                    <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <div className="space-y-1.5">
                      <p className="text-sm font-bold text-gray-800 leading-snug">{mpesaStatusMsg || 'Processing…'}</p>
                      {pendingCheckoutId && (
                        <p className="text-[9px] text-gray-400 font-mono break-all">{pendingCheckoutId}</p>
                      )}
                    </div>
                    {mpesaError && (
                      <p className="text-[10px] text-red-600 font-semibold bg-red-100 p-2 rounded-lg">{mpesaError}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white p-3 rounded-lg border border-gray-300 text-xs space-y-1">
                      <p className="text-gray-500 font-semibold uppercase tracking-wider text-[9px]">Lipa Na M-Pesa Online</p>
                      <p className="text-gray-800 font-medium">Pay Bill: <span className="font-bold text-black">WEKELEA ESCROW</span></p>
                      <p className="text-gray-800 font-medium">Amount: <span className="font-extrabold text-emerald-600">KES {mpesaAmount.toLocaleString()}</span></p>
                      <p className="text-gray-800 font-medium">Phone: <span className="font-bold text-black">+{mpesaPhone}</span></p>
                    </div>

                    <p className="text-[10px] text-gray-500 text-center leading-snug">
                      An M-Pesa prompt will be sent to <span className="font-bold">+{mpesaPhone}</span>. Enter your PIN on your phone to approve and fund the escrow.
                    </p>

                    {mpesaError && (
                      <p className="text-[10px] text-red-600 font-semibold bg-red-100 p-2 rounded-lg">{mpesaError}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={executeMpesaSTK} className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs shadow-md transition">
                        Send M-Pesa Prompt
                      </button>
                      <button onClick={() => { setShowMpesaPrompt(false); setMpesaError(null); }} className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-2.5 rounded-xl text-xs transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- SCREEN 4: CREATE CONTRACT FORM --- */}
      {currentView === 'create-contract' && currentUser && (
        <form onSubmit={handleCreateContract} className="space-y-5 py-2">
          
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <h2 className="text-xl font-black text-white">New Escrow Agreement</h2>
            <button type="button" onClick={() => setCurrentView('dashboard')} className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 transition">
              Cancel
            </button>
          </div>

          {/* Categories */}
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2 uppercase tracking-wider">Agreement Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Creative Work', 'Freelance', 'Personal Goal', 'Fitness', 'Business', 'Lending', 'Marketplace', 'Deliveries', 'Coaching', 'Community', 'Custom'] as AgreementCategory[]).map((cat) => (
                <button key={cat} type="button" onClick={() => setNewCategory(cat)} className={`py-3 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center space-y-1 ${newCategory === cat ? 'bg-[#EC7505]/15 border-[#EC7505] text-[#EC7505]' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}>
                  <span className="text-lg">{getCategoryIcon(cat)}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1 uppercase tracking-wider">Agreement Title</label>
            <input 
              id="new-contract-title"
              type="text" 
              placeholder="e.g. Logo design for my cafe"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="input-field text-sm"
              required
            />
            <span className="text-[10px] text-gray-500 block mt-1">Specify an objective subject clear of opinion ambiguity.</span>
          </div>

          {/* Objective Verification Conditions (Dynamic List Builder) */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Objective Verification Conditions</label>
              <button 
                type="button"
                onClick={() => setNewTermsList([...newTermsList, ''])}
                className="text-[10px] bg-[#EC7505]/10 hover:bg-[#EC7505]/20 text-[#EC7505] border border-[#EC7505]/30 px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1"
              >
                <Plus size={10} />
                <span>Add Condition</span>
              </button>
            </div>
            
            <div className="space-y-2.5">
              {newTermsList.map((term, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-[#D4AF37] min-w-[16px]">{index + 1}.</span>
                  <input 
                    type="text"
                    placeholder={`e.g. Condition ${index + 1} (e.g. Deliver 3 logo concepts by Friday)`}
                    value={term}
                    onChange={(e) => {
                      const updated = [...newTermsList];
                      updated[index] = e.target.value;
                      setNewTermsList(updated);
                    }}
                    className="input-field text-xs flex-1"
                    required
                  />
                  {newTermsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = newTermsList.filter((_, i) => i !== index);
                        setNewTermsList(updated);
                      }}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <span className="text-[10px] text-gray-500 block mt-1">Specify clear, measurable conditions. These will form the checklist both parties must confirm before release.</span>
          </div>

          {/* Escrow Amount Slider */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Escrow Amount (each party)</label>
              <span className="text-lg font-black text-[#EC7505]">KES {Number(newEscrow).toLocaleString()}</span>
            </div>
            <input
              id="new-contract-stake"
              type="range" 
              min="100" 
              max="10000" 
              step="100"
              value={newEscrow}
              onChange={(e) => setNewEscrow(e.target.value)}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EC7505]"
            />
            <div className="flex justify-between text-[9px] text-gray-500 pt-1 font-bold">
              <span>MIN: KES 100</span>
              <span>Total held in escrow: <strong className="text-white font-extrabold text-xs">KES {(Number(newEscrow)*2).toLocaleString()}</strong></span>
              <span>MAX: KES 10,000</span>
            </div>
          </div>

          {/* Invite a specific user */}
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1 uppercase tracking-wider">Other Party (Username)</label>
            <input
              id="new-contract-opponent"
              type="text"
              placeholder="e.g. Mwende_Vibe (or leave empty for a public agreement)"
              value={newCounterparty}
              onChange={(e) => setNewCounterparty(e.target.value)}
              className="input-field text-sm"
            />
            <span className="text-[10px] text-gray-500 block mt-1">If blank, any user can accept this agreement from the public feed.</span>
          </div>

          {/* Advanced Accordion Toggle */}
          <div className="border border-white/5 rounded-2xl p-4 bg-white/5 space-y-4">
            <span className="text-xs font-bold text-gray-300 block uppercase tracking-wider">Advanced Escrow Settings</span>

            {/* Verification Source Link */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1 uppercase font-bold">Verification Source Link</label>
              <input
                id="new-contract-reference"
                type="url"
                placeholder="e.g. link to the brief, contract, or evidence source"
                value={newTrustedSource}
                onChange={(e) => setNewTrustedSource(e.target.value)}
                className="input-field text-xs pl-3"
              />
            </div>

            {/* Optional note */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1 uppercase font-bold">Attach a note (optional)</label>
              <input
                id="new-contract-trashtalk"
                type="text"
                placeholder="e.g. Looking forward to working with you!"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="input-field text-xs"
              />
            </div>

            {/* Privacy setting */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1.5 uppercase font-bold">Agreement Visibility</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Public', 'Friends', 'Private'] as PrivacySetting[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setNewPrivacy(mode)} className={`py-2 rounded-lg text-xs font-bold transition ${newPrivacy === mode ? 'bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37]' : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'}`}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            id="new-contract-submit"
            type="submit" 
            className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-black py-4 px-6 rounded-2xl shadow-lg transition active:scale-95 text-base uppercase tracking-wider flex items-center justify-center space-x-2"
          >
            <ShieldCheck size={20} />
            <span>Lock Contract terms</span>
          </button>
        </form>
      )}

      {/* --- SCREEN 10 & 11: WALLET & TRANSACTION HISTORY --- */}
      {currentView === 'wallet' && currentUser && (
        <div className="space-y-6 py-2">
          
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <h2 className="text-xl font-black text-white flex items-center space-x-1.5">
              <Wallet size={20} className="text-[#EC7505]" />
              <span>Wallet Ledger</span>
            </h2>
            <button onClick={() => setCurrentView('dashboard')} className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 transition">
              Dashboard
            </button>
          </div>

          {/* Cashout withdrawal Form */}
          <div className="glass p-5 rounded-3xl border-white/5 space-y-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Instant M-Pesa Cashout</span>
              <p className="text-[11px] text-gray-500">Funds transfer directly to your phone +{currentUser.phone} via M-Pesa B2C withdrawal channel.</p>
            </div>
            
            <form onSubmit={handleWithdrawFunds} className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1 uppercase font-bold">Amount to withdraw (KES)</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-sm text-gray-400 font-bold">KES</span>
                  <input 
                    id="withdraw-amount-input"
                    type="number" 
                    placeholder="1000" 
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="input-field pl-12"
                    required
                  />
                </div>
              </div>

              <button 
                id="withdraw-submit-btn"
                type="submit" 
                className="w-full bg-[#D4AF37] hover:bg-[#c9a32c] text-black font-extrabold py-3.5 px-4 rounded-xl shadow transition active:scale-95 text-xs uppercase tracking-wider"
              >
                Disburse to M-Pesa Wallet
              </button>
            </form>
          </div>

          {/* Transaction logs */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">Transaction Ledger Logs</h3>
            
            <div className="flex flex-col space-y-2">
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-xs glass rounded-2xl border-white/5">
                  No transaction history recorded yet.
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="glass p-4 rounded-2xl flex items-center justify-between border-white/5 text-xs">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg p-2 rounded-full bg-white/5">
                        {tx.type === 'DEPOSIT' ? '📥' : 
                         tx.type === 'WITHDRAW' ? '📤' : 
                         tx.type === 'LOCK' ? '🔒' : '🔓'}
                      </span>
                      <div>
                        <h4 className="font-bold text-white leading-tight">{tx.description}</h4>
                        <span className="text-[10px] text-gray-500 block font-mono mt-0.5">{tx.reference} • {new Date(tx.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-black text-sm block ${tx.type === 'DEPOSIT' || tx.type === 'UNLOCK' ? 'text-emerald-400' : 'text-gray-300'}`}>
                        {tx.type === 'DEPOSIT' || tx.type === 'UNLOCK' ? '+' : '-'} KES {tx.amount.toLocaleString()}
                      </span>
                      <span className="text-[9px] text-gray-500 uppercase font-semibold">{tx.type}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* --- SCREEN 14: ADMIN MODERATION DASHBOARD --- */}
      {currentView === 'admin' && currentUser && currentUser.id === 'admin' && (
        <div className="space-y-6 py-2">
          
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <h2 className="text-xl font-black text-white flex items-center space-x-2">
              <Scale size={20} className="text-amber-500" />
              <span>Escrow Admin Center</span>
            </h2>
            <button onClick={() => setCurrentView('dashboard')} className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 transition">
              Dashboard
            </button>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">Active Dispute Resolutions ({disputes.length})</h3>

            {disputes.length === 0 ? (
              <div className="glass p-12 text-center text-gray-500 text-xs rounded-3xl border-white/5">
                No active dispute logs on the platform. All escrows settled consensually!
              </div>
            ) : (
              disputes.map((dispute) => (
                <div key={dispute.id} className="glass p-5 rounded-3xl border-white/5 space-y-4 text-xs">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="font-bold text-gray-400">DISPUTE: {dispute.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dispute.status === 'OPEN' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                      {dispute.status}
                    </span>
                  </div>

                  {/* Reason */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 block uppercase font-bold">Dispute Evidence / Reason</span>
                    <p className="text-gray-200 bg-white/5 p-3 rounded-lg border border-white/5 font-mono">{dispute.reason}</p>
                  </div>

                  {/* Decision fields */}
                  {dispute.status === 'OPEN' && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1 uppercase font-bold">Arbitration Resolution Notes</label>
                        <input 
                          id="admin-resolution-notes"
                          type="text" 
                          placeholder="State resolution logic, e.g. Reviewed the delivered work against the agreed conditions..."
                          value={adminResolutionNotes}
                          onChange={(e) => setAdminResolutionNotes(e.target.value)}
                          className="input-field text-xs pl-3"
                          required
                        />
                      </div>

                      {(() => {
                        const disputeContract = contractsByDispute[dispute.id];
                        const creator = disputeContract ? usersById[disputeContract.creatorId] : undefined;
                        const counterparty = disputeContract?.counterpartyId ? usersById[disputeContract.counterpartyId] : undefined;
                        return (
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => disputeContract && handleAdminResolve(dispute.id, disputeContract.creatorId)}
                              disabled={!disputeContract}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded text-[10px] transition"
                            >
                              Release to {creator?.username ?? 'Creator'} (Creator)
                            </button>
                            <button
                              onClick={() => disputeContract?.counterpartyId && handleAdminResolve(dispute.id, disputeContract.counterpartyId)}
                              disabled={!disputeContract?.counterpartyId}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded text-[10px] transition"
                            >
                              Release to {counterparty?.username ?? 'Other Party'} (Other Party)
                            </button>
                            <button onClick={() => handleAdminRefund(dispute.id)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded text-[10px] transition">
                              Refund Both (Split)
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {dispute.status !== 'OPEN' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-emerald-400">
                      <strong>Closed:</strong> {dispute.resolutionDetails}
                    </div>
                  )}

                </div>
              ))
            )}
          </div>

        </div>
      )}

    </div>
    </>
  );
}
