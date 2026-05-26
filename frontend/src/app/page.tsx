'use html';
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
import { WekeleaAPI, User, Contract, Dispute, Transaction, Notification, EventCategory, PrivacySetting } from '../services/api';
import { io, Socket } from 'socket.io-client';
import dynamic from 'next/dynamic';

const ThreeDSplashScreen = dynamic(() => import('../components/ThreeDSplashScreen'), {
  ssr: false
});

const BACKEND_WS = 'http://localhost:5001';

export default function WekeleaApp() {
  // --- STATE ---
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  
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

  // New Contract creation fields
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EventCategory>('Sports');
  const [newTerms, setNewTerms] = useState('');
  const [newTermsList, setNewTermsList] = useState<string[]>(['']);
  const [newStake, setNewStake] = useState('1000');
  const [newEventDate, setNewEventDate] = useState('');
  const [newTrustedSource, setNewTrustedSource] = useState('');
  const [newTrashTalk, setNewTrashTalk] = useState('');
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

  // Socket
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Demo Assist states
  const [demoSelectedRole, setDemoSelectedRole] = useState<'creator' | 'counterparty'>('creator');
  const [notificationBanner, setNotificationBanner] = useState<{ title: string; message: string } | null>(null);

  // --- COMPONENT MOUNT & DATA INITIALIZATION ---
  useEffect(() => {
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
    }
  }, []);

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
        }
      } catch (err) {
        console.error('API Error: Data fetching failed, using fallback mock states', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll every 4s for backup sync

    return () => clearInterval(interval);
  }, [currentUser, selectedContract?.id]);

  // Configure WebSockets for instant state push
  useEffect(() => {
    if (!currentUser) return;

    // Connect to Backend Socket Server
    const socket = io(BACKEND_WS);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('🔌 Connected to Wekelea real-time engine');
      
      // Register this socket to receive notification push alerts
      socket.emit('join_user_notifications', currentUser.id);
      
      if (currentUser.id === 'admin') {
        socket.emit('join_admin');
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Listen for real-time notifications
    socket.on('notification_received', async (data: { title: string; contractId?: string }) => {
      // Display quick interactive alert banner
      setNotificationBanner({
        title: data.title,
        message: 'Click to open details and sync live status.'
      });
      setTimeout(() => setNotificationBanner(null), 5000);

      // Re-fetch notifications
      const freshNotes = await WekeleaAPI.getNotifications(currentUser.id);
      setNotifications(freshNotes);
      
      // Re-fetch contracts
      const freshContracts = await WekeleaAPI.getContracts(currentUser.id);
      setContracts(freshContracts);
    });

    // Listen for balance updates
    socket.on('balance_updated', (data: { balance: number }) => {
      setCurrentUser(prev => prev ? { ...prev, walletBalance: data.balance } : null);
    });

    // Listen for general resets
    socket.on('system_reset', () => {
      window.location.reload();
    });

    return () => {
      socket.disconnect();
    };
  }, [currentUser?.id]);

  // Join selected contract room on socket to listen for live status updates
  useEffect(() => {
    if (!socketRef.current || !selectedContract) return;

    const socket = socketRef.current;
    socket.emit('join_contract', selectedContract.id);

    socket.on('contract_updated', (updated: Contract) => {
      console.log('📄 Live Update: Contract state synchronized', updated);
      setSelectedContract(updated);
      
      // Also update in contracts list
      setContracts(prev => prev.map(c => c.id === updated.id ? updated : c));
    });

    return () => {
      socket.off('contract_updated');
    };
  }, [selectedContract?.id]);

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
        stakeAmount: Number(newStake),
        eventDate: newEventDate ? new Date(newEventDate).toISOString() : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        trustedSource: newTrustedSource,
        trashTalk: newTrashTalk,
        privacy: newPrivacy,
        creatorId: currentUser.id,
        counterpartyUsername: newCounterparty
      });

      // Clear fields
      setNewTitle('');
      setNewTerms('');
      setNewTermsList(['']);
      setNewStake('1000');
      setNewEventDate('');
      setNewTrustedSource('');
      setNewTrashTalk('');
      setNewCounterparty('');

      setSelectedContract(contract);
      setCurrentView('dashboard');
      setShowShareModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to create contract');
    }
  };

  const handleAcceptContract = async (contractId: string) => {
    if (!currentUser) return;
    try {
      const updated = await WekeleaAPI.acceptContract(contractId, currentUser.id);
      setSelectedContract(updated);
    } catch (e: any) {
      alert(e.message || 'Error accepting contract');
    }
  };

  // Payment triggers M-Pesa push simulation
  const handleMpesaDepositTrigger = async (contract: Contract) => {
    if (!currentUser) return;
    
    setMpesaPhone(currentUser.phone);
    setMpesaAmount(contract.stakeAmount);
    setShowMpesaPrompt(true);
  };

  const executeSimulatedMpesaSTK = async () => {
    if (!currentUser || !selectedContract) return;

    setIsProcessingPayment(true);
    setMpesaError(null);

    try {
      // 1. Trigger pending transaction creation
      const res = await WekeleaAPI.initiateSTKPush({
        phone: mpesaPhone,
        amount: mpesaAmount,
        contractId: selectedContract.id,
        userId: currentUser.id
      });

      setPendingCheckoutId(res.CheckoutRequestID);

      // Simulate a brief delay representing Safaricom prompt arrival and user PIN input
      setTimeout(async () => {
        try {
          // 2. Trigger simulated callback response (success)
          await WekeleaAPI.triggerCallback(res.CheckoutRequestID, true);
          
          // 3. Immediately trigger lock stake on the contract
          const updated = await WekeleaAPI.fundContract(selectedContract.id, currentUser.id);
          setSelectedContract(updated);

          // Update user wallet balance locally
          const freshUser = await WekeleaAPI.getUser(currentUser.id);
          setCurrentUser(freshUser);
          localStorage.setItem('wekelea_user', JSON.stringify(freshUser));

          setIsProcessingPayment(false);
          setShowMpesaPrompt(false);
          setPendingCheckoutId(null);
        } catch (e: any) {
          setMpesaError('Callback execution failed: ' + e.message);
          setIsProcessingPayment(false);
        }
      }, 3500);

    } catch (err: any) {
      setMpesaError(err.message || 'M-Pesa STK trigger failed');
      setIsProcessingPayment(false);
    }
  };

  const handleClaimWin = async (contractId: string) => {
    if (!currentUser) return;
    try {
      const updated = await WekeleaAPI.claimWin(contractId, currentUser.id);
      setSelectedContract(updated);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleApproveSettle = async (contractId: string) => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to approve settlement? This will immediately release KES ' + selectedContract?.totalPot + ' (minus 5% fee) to the winner wallet.')) return;
    try {
      const updated = await WekeleaAPI.approveSettlement(contractId, currentUser.id);
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
      const updated = await WekeleaAPI.disputeClaim(selectedContract.id, currentUser.id, disputeReason);
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

  const handleAdminResolve = async (disputeId: string, winnerId: string) => {
    if (!currentUser || currentUser.id !== 'admin' || !adminResolutionNotes) {
      alert('Resolution notes are required');
      return;
    }

    try {
      await WekeleaAPI.adminResolveDispute(disputeId, winnerId, adminResolutionNotes);
      alert('Dispute successfully arbitrated. Funds distributed to winner.');
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
      alert('Stakes refunded fully to both users. Dispute closed.');
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

  const getCategoryIcon = (category: EventCategory) => {
    switch (category) {
      case 'Sports': return '🏆';
      case 'Gaming': return '🎮';
      case 'Crypto': return '🪙';
      case 'Entertainment': return '🎬';
      case 'Politics': return '⚖️';
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
              Put your money where <br />
              <span className="text-[#EC7505] bg-clip-text">your mouth is.</span>
            </h1>
            <p className="text-gray-400 text-sm max-w-sm">
              Settle social arguments instantly. Create custom conditional contracts, lock stakes in escrow using M-Pesa, and verify mutual settlement. Fast, peer-to-peer, and secure.
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
              <span>Launch App & Challenge</span>
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
              <p className="text-[11px] text-gray-400 leading-tight">Consenting agreements. Funds remain fully secured inside independent vault ledger.</p>
            </div>
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">🟢</span>
              <h3 className="font-bold text-sm">M-Pesa Native</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Instant STK push deposits and seamless instant cashouts direct to Kenyan wallets.</p>
            </div>
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">🔬</span>
              <h3 className="font-bold text-sm">100% Verifiable</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Only objective events allowed. Clear parameters ensure honest, unambiguous settlement.</p>
            </div>
            <div className="glass p-4 rounded-2xl flex flex-col space-y-2 border-white/5">
              <span className="text-2xl">⚖️</span>
              <h3 className="font-bold text-sm">Dispute Safe</h3>
              <p className="text-[11px] text-gray-400 leading-tight">Modular arbiter rules. Freezes stakes and relies on trust logs and evidence boards.</p>
            </div>
          </div>

          {/* Brand Assets Reference & Info Box */}
          <div className="glass p-5 rounded-3xl border-white/5 space-y-3">
            <h3 className="font-extrabold text-white text-sm flex items-center space-x-1.5">
              <span>🎨</span>
              <span>Wekelea Custom Branding Setup</span>
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Your custom branding is fully integrated! We mapped your uploaded logo assets inside the project directories for instant application-wide updates.
            </p>
            <div className="bg-black/20 rounded-xl p-3 text-[10px] font-mono space-y-1.5 border border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Branding Folder:</span>
                <span className="text-[#EC7505]">/frontend/public/assets</span>
              </div>
              <div className="flex justify-between items-center border-t border-white/5 pt-1.5">
                <span className="text-gray-400">Active Logo file:</span>
                <span className="text-emerald-400">logo.png (104 KB)</span>
              </div>
              <div className="flex justify-between items-center border-t border-white/5 pt-1.5">
                <span className="text-gray-400">Active Icon file:</span>
                <span className="text-emerald-400">favicon.ico (4 KB)</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 leading-snug">
              To swap logos or icons in the future, simply drop your new images directly into the <code className="text-white">public/assets</code> folder, overwriting the filenames above.
            </p>
          </div>

          {/* Legal / Policy Section */}
          <div id="how-it-works-section" className="glass p-5 rounded-2xl border-white/5 space-y-4 mt-8">
            <h3 className="font-extrabold text-white text-lg flex items-center space-x-1.5">
              <span>⚖️</span>
              <span>Wekelea Responsible Use & Trust Rules</span>
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Wekelea is built entirely as a <strong>peer-to-peer escrow service</strong>. We provide secure vaults for two consenting users to hold custom challenge stakes. The platform itself generates no odds, acts as no bookmaker, provides no automated scraping feeds, and enforces that agreements must be based only on objectively verifiable events.
            </p>
            <div className="grid grid-cols-2 gap-3 text-[10px] pt-2">
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>Strictly 18+ platform restrictions</span>
              </div>
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>Consensual claims & dual settlement approvals</span>
              </div>
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>Secure manual dispute evidence boards</span>
              </div>
              <div className="flex items-start space-x-1 text-emerald-400">
                <Check size={12} className="mt-0.5 flex-shrink-0" />
                <span>5% platform transaction fee upon payout</span>
              </div>
            </div>
            <div className="text-[10px] text-gray-400 border-t border-white/5 pt-3">
              By using our platform, you accept our <span className="text-[#D4AF37] underline cursor-pointer">Terms of Service</span>, <span className="text-[#D4AF37] underline cursor-pointer">Privacy Policy</span>, and strict <span className="text-[#D4AF37] underline cursor-pointer">Responsible Use Policy</span>.
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
                  No notifications yet. Create a challenge or stakes to see updates.
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
          
          {/* Quick Create Challenge CTA */}
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
              <span>Create Challenge</span>
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
                    Create your first challenge now!
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

                  {/* Stake breakdown */}
                  <div className="flex justify-between items-center pt-3 border-t border-white/5">
                    <div className="flex items-baseline space-x-1">
                      <span className="text-[#EC7505] font-black text-base">KES {contract.stakeAmount.toLocaleString()}</span>
                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">each</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-500 block">Locked Escrow Vault</span>
                      <span className="font-extrabold text-sm text-white">KES {contract.totalPot.toLocaleString()}</span>
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
                    {selectedContract.status} Escrow Vault
                  </span>
                  
                  {selectedContract.status === 'ACTIVE' && (
                    <div className="flex items-center space-x-1 text-xs text-[#EC7505] font-bold bg-[#EC7505]/10 py-1 px-2.5 rounded-full border border-[#EC7505]/20 animate-pulse">
                      <Lock size={12} />
                      <span>KES {selectedContract.totalPot.toLocaleString()} LOCKED IN VAULT</span>
                    </div>
                  )}

                  <h2 className="text-2xl font-black text-white leading-tight pt-1">{selectedContract.title}</h2>
                  <span className="text-xs text-gray-400">{getCategoryIcon(selectedContract.category)} Category: {selectedContract.category}</span>
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

                {/* Participant Stakes Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass p-3 rounded-xl border-white/5 flex flex-col space-y-1">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Creator Stake</span>
                    <span className="text-xs font-bold text-white">KES {selectedContract.stakeAmount.toLocaleString()}</span>
                    <span className={`text-[10px] font-semibold flex items-center space-x-1 ${selectedContract.creatorStatus === 'FUNDED' ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {selectedContract.creatorStatus === 'FUNDED' ? '✅ Funded' : '⏳ Awaiting Funding'}
                    </span>
                  </div>

                  <div className="glass p-3 rounded-xl border-white/5 flex flex-col space-y-1">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Opponent Stake</span>
                    <span className="text-xs font-bold text-white">KES {selectedContract.stakeAmount.toLocaleString()}</span>
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
                    <span>Contract Created:</span>
                    <span>{new Date(selectedContract.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Trash Talk Card */}
                {selectedContract.trashTalk && (
                  <div className="p-3 bg-red-950/20 border border-red-900/10 rounded-xl flex items-start space-x-2">
                    <MessageSquare size={14} className="text-red-400 mt-0.5" />
                    <div className="flex-1">
                      <span className="text-[9px] text-red-400 uppercase tracking-widest font-bold">Trash Talk Inbox</span>
                      <p className="text-xs text-gray-300 italic">“{selectedContract.trashTalk}”</p>
                    </div>
                  </div>
                )}

                {/* ACTION ROUTER ACCORDING TO STATE AND USER PERSPECTIVE */}
                <div className="space-y-3 pt-4">

                  {/* 1. CONTRACT IS AWAITING ACCEPTANCE (Opponent View vs Creator View) */}
                  {selectedContract.status === 'AWAITING_ACCEPTANCE' && (
                    <>
                      {selectedContract.creatorId === currentUser.id ? (
                        <div className="text-center py-2">
                          <p className="text-xs text-yellow-400 mb-3 font-semibold">Awaiting acceptance by opponent.</p>
                          <button onClick={() => setShowShareModal(true)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-1 shadow transition">
                            <Share2 size={16} />
                            <span>Share Invitation Link</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 bg-[#EC7505]/5 border border-[#EC7505]/20 p-4 rounded-2xl">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Accept Challenge Terms</h4>
                          <div className="flex items-start space-x-2 mb-3">
                            <input type="checkbox" id="terms-confirm-box" className="custom-checkbox mt-0.5" defaultChecked />
                            <label htmlFor="terms-confirm-box" className="text-[10px] text-gray-300 leading-snug">
                              I confirm that the terms above are <strong>objectively verifiable</strong> and represent our agreement. I understand both parties must lock stakes to activate the vault.
                            </label>
                          </div>
                          <button onClick={() => handleAcceptContract(selectedContract.id)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-3 px-4 rounded-xl shadow transition">
                            Accept Challenge Terms
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
                          <p className="text-xs text-orange-400 font-semibold">Your stake of KES {selectedContract.stakeAmount.toLocaleString()} is due to activate the vault escrow.</p>
                          <button onClick={() => handleMpesaDepositTrigger(selectedContract)} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-black py-3 px-4 rounded-xl flex items-center justify-center space-x-1.5 shadow transition">
                            <Wallet size={16} />
                            <span>Pay Stake via M-Pesa STK</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center py-3 text-xs text-gray-400 glass rounded-2xl border-white/5">
                          ⏳ Paid! Awaiting opponent deposit to activate escrow vault.
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
                          <p className="text-[10px] text-gray-400">You must check all objective terms to submit a claim for the pot:</p>
                          
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
                            handleClaimWin(selectedContract.id);
                            setClaimChecklist({});
                          }}
                          className={`w-full font-extrabold py-3.5 px-4 rounded-xl shadow transition text-sm uppercase tracking-wider flex items-center justify-center space-x-2 ${isAllChecked ? 'bg-[#EC7505] hover:bg-[#D84A05] text-black active:scale-95' : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5'}`}
                        >
                          <Award size={18} />
                          <span>Claim Win & Request Settlement</span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* 4. CLAIM IN PROCESS */}
                  {selectedContract.status === 'CLAIMED' && (
                    <div className="space-y-3">
                      {selectedContract.claimedById === currentUser.id ? (
                        <div className="text-center py-3 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
                          ⏳ Claim submitted! Awaiting counterparty settlement approval.
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
                              <span className="text-xs text-gray-400 block font-semibold">Counterparty has claimed the win.</span>
                              <span className="text-sm font-bold text-white">Do you consent to release escrow?</span>
                              <p className="text-[10px] text-gray-400 mt-1">Verify that each condition was met by checking them off before releasing the pot:</p>
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
                                <span>Consent & Settle</span>
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
                        Settlement rejected. Escrow locked. Wekelea admin is reviewing evidence timeline. Restore ratings by sending verification links.
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
                        Total Pot KES {selectedContract.totalPot.toLocaleString()} successfully paid out. (Wekelea 5% fee deducted).
                      </p>
                    </div>
                  )}

                  {/* 7. REFUNDED STATE */}
                  {selectedContract.status === 'REFUNDED' && (
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl text-center">
                      <p className="text-xs text-purple-400 font-semibold">Admin Refund Executed.</p>
                      <p className="text-[10px] text-gray-400 mt-1">Full stakes of KES {selectedContract.stakeAmount.toLocaleString()} credited back to both participant wallets.</p>
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
                  <h3 className="text-xl font-black text-white">Challenge Shared!</h3>
                  <p className="text-xs text-gray-400">Send this link to your opponent. Once they accept terms, deposits activate.</p>
                </div>

                {/* Mock QR Area */}
                <div className="flex flex-col items-center p-4 bg-white rounded-2xl w-44 h-44 mx-auto relative justify-center shadow-lg">
                  {/* Generated QR Code Simulation */}
                  <div className="w-36 h-36 border-4 border-black bg-slate-100 flex flex-col items-center justify-center p-1 rounded-lg">
                    <span className="text-[10px] font-black text-black tracking-widest text-center uppercase leading-none">Wekelea P2P<br />Escrow Link</span>
                    <div className="grid grid-cols-6 gap-0.5 mt-2">
                      {Array.from({ length: 36 }).map((_, i) => (
                        <div key={i} className={`w-3.5 h-3.5 ${((i * 3) % 4 === 0 || i % 7 === 0) ? 'bg-black' : 'bg-transparent'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action button */}
                <div className="space-y-3">
                  <button onClick={copyShareLink} className="w-full bg-[#EC7505] hover:bg-[#D84A05] text-black font-extrabold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-1.5 shadow active:scale-95 text-xs uppercase tracking-wider">
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedLink ? 'Copied to Clipboard!' : 'Copy Invitation Link'}</span>
                  </button>

                  <a href={`https://wa.me/?text=${encodeURIComponent(`Accept my escrow challenge on Wekelea: "${selectedContract.title}" with a stake of KES ${selectedContract.stakeAmount}. Link: ${window.location.origin}/?contractId=${selectedContract.id}`)}`} target="_blank" rel="noopener noreferrer" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-1.5 shadow active:scale-95 text-xs uppercase tracking-wider">
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
                  <span className="text-[10px] text-gray-500 font-semibold">SIM Prompt</span>
                </div>

                {isProcessingPayment ? (
                  <div className="py-6 flex flex-col items-center space-y-4 text-center">
                    {pendingCheckoutId ? (
                      <>
                        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-gray-800">Processing Escrow Deposit</p>
                          <p className="text-[11px] text-gray-500">Authenticating transaction ref: <br /><span className="font-mono text-xs font-semibold text-emerald-700">{pendingCheckoutId}</span></p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-gray-600">Contacting Safaricom Daraja API gateway...</p>
                      </>
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

                    {mpesaError && (
                      <p className="text-[10px] text-red-600 font-semibold bg-red-100 p-2 rounded-lg">{mpesaError}</p>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 block uppercase font-bold">Simulate M-Pesa SIM PIN entry</label>
                      <input 
                        type="password" 
                        placeholder="••••" 
                        maxLength={4} 
                        className="w-full text-center tracking-widest text-lg font-bold bg-white border border-gray-300 rounded-lg p-2 focus:outline-none focus:border-emerald-600 text-black"
                        defaultValue="1234"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={executeSimulatedMpesaSTK} className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs shadow-md transition">
                        Confirm PIN
                      </button>
                      <button onClick={() => setShowMpesaPrompt(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-bold py-2.5 rounded-xl text-xs transition">
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
            <h2 className="text-xl font-black text-white">New Escrow Contract</h2>
            <button type="button" onClick={() => setCurrentView('dashboard')} className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 transition">
              Cancel
            </button>
          </div>

          {/* Categories */}
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-2 uppercase tracking-wider">Event Category</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Sports', 'Gaming', 'Crypto', 'Entertainment', 'Politics', 'Custom'] as EventCategory[]).map((cat) => (
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
              placeholder="e.g. Arsenal beats Manchester United"
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
                    placeholder={`e.g. Condition ${index + 1} (e.g. Must win by 2+ goals)`}
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
            <span className="text-[10px] text-gray-500 block mt-1">Specify clear, measurable rules. These will form the checklist both players must confirm upon settlement.</span>
          </div>

          {/* Stake Amount Sliders */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Individual Stake Amount</label>
              <span className="text-lg font-black text-[#EC7505]">KES {Number(newStake).toLocaleString()}</span>
            </div>
            <input 
              id="new-contract-stake"
              type="range" 
              min="100" 
              max="10000" 
              step="100"
              value={newStake}
              onChange={(e) => setNewStake(e.target.value)}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#EC7505]"
            />
            <div className="flex justify-between text-[9px] text-gray-500 pt-1 font-bold">
              <span>MIN: KES 100</span>
              <span>Total pot locked inside Escrow: <strong className="text-white font-extrabold text-xs">KES {(Number(newStake)*2).toLocaleString()}</strong></span>
              <span>MAX: KES 10,000</span>
            </div>
          </div>

          {/* Challenge a specific user */}
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1 uppercase tracking-wider">Challenge Opponent (Username)</label>
            <input 
              id="new-contract-opponent"
              type="text" 
              placeholder="e.g. Mwende_Vibe (or leave empty for public challenge)"
              value={newCounterparty}
              onChange={(e) => setNewCounterparty(e.target.value)}
              className="input-field text-sm"
            />
            <span className="text-[10px] text-gray-500 block mt-1">If blank, any user can accept this contract from the public feed.</span>
          </div>

          {/* Advanced Accordion Toggle */}
          <div className="border border-white/5 rounded-2xl p-4 bg-white/5 space-y-4">
            <span className="text-xs font-bold text-gray-300 block uppercase tracking-wider">Advanced Vault Settings</span>
            
            {/* Trusted Source Link */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1 uppercase font-bold">Trusted Source Link</label>
              <input 
                id="new-contract-reference"
                type="url" 
                placeholder="e.g. https://www.premierleague.com"
                value={newTrustedSource}
                onChange={(e) => setNewTrustedSource(e.target.value)}
                className="input-field text-xs pl-3"
              />
            </div>

            {/* Trash Talk */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1 uppercase font-bold">Attach trash talk / banter</label>
              <input 
                id="new-contract-trashtalk"
                type="text" 
                placeholder="e.g. Get ready to pay for my Friday drinks!"
                value={newTrashTalk}
                onChange={(e) => setNewTrashTalk(e.target.value)}
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
              <p className="text-[11px] text-gray-500">Funds transfer directly to your phone +{currentUser.phone} via M-Pesa B2C payout channel.</p>
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
                          placeholder="State resolution logic, e.g. Checked official Premier League score..."
                          value={adminResolutionNotes}
                          onChange={(e) => setAdminResolutionNotes(e.target.value)}
                          className="input-field text-xs pl-3"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {/* Simulate favors for u1, u2, u3, u4 dynamically depending on creator/counterparty */}
                        <button onClick={() => handleAdminResolve(dispute.id, 'u1')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded text-[10px] transition">
                          Settle Mwangi (Creator)
                        </button>
                        <button onClick={() => handleAdminResolve(dispute.id, 'u2')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded text-[10px] transition">
                          Settle Mwende (Opponent)
                        </button>
                        <button onClick={() => handleAdminRefund(dispute.id)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded text-[10px] transition">
                          Refund Both (Split)
                        </button>
                      </div>
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
