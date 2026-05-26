import { Router, Request, Response } from 'express';
import { Database } from '../db/db';
import { EscrowService } from '../services/escrow';
import { MpesaService } from '../services/mpesa';
import { User, Contract, EventCategory, PrivacySetting } from '../types';

export const apiRouter = Router();

// Helper to safely emit socket events
const emitSocket = (req: Request, room: string, event: string, data: any) => {
  const io = req.app.get('io');
  if (io) {
    io.to(room).emit(event, data);
    console.log(`📡 Socket: Emitted ${event} to ${room}`);
  }
};

// --- AUTH ROUTER ---

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Format phone to standard format (e.g. 254...)
    let formattedPhone = phone.trim().replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith('254') && formattedPhone.length === 9) {
      formattedPhone = '254' + formattedPhone;
    }

    let user = await Database.getUser(formattedPhone);

    if (!user) {
      // Create new user (Sign Up)
      const username = 'User_' + formattedPhone.substring(formattedPhone.length - 4);
      user = await Database.createUser({
        id: 'u_' + Math.random().toString(36).substring(2, 10),
        phone: formattedPhone,
        username,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
        trustScore: 90, // Starting trust score
        contractsCompleted: 0,
        winStreak: 0,
        walletBalance: 0 // Starts empty, must deposit via M-Pesa
      });
    }

    // Return user with simulated JWT token
    const token = 'simulated_jwt_token_for_' + user.id;
    return res.status(200).json({ user, token });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/auth/verify-otp', async (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ error: 'Phone number and code required' });
  }
  try {
    const user = await Database.getUser(phone);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = 'simulated_jwt_token_for_' + user.id;
    return res.status(200).json({ user, token });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// --- USER ROUTER ---

apiRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await Database.getUsers();
    return res.status(200).json(users);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await Database.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json(user);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/users/:id/transactions', async (req: Request, res: Response) => {
  try {
    const txs = await Database.getTransactions(req.params.id);
    return res.status(200).json(txs);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/users/:id/notifications', async (req: Request, res: Response) => {
  try {
    const notifications = await Database.getNotifications(req.params.id);
    return res.status(200).json(notifications);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/users/:id/notifications/read', async (req: Request, res: Response) => {
  try {
    await Database.markNotificationsRead(req.params.id);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/users/:id/withdraw', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const userId = req.params.id;
    const user = await Database.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const withdrawAmount = Number(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }
    if (user.walletBalance < withdrawAmount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // Deduct and create tx
    await Database.updateUser(userId, {
      walletBalance: user.walletBalance - withdrawAmount
    });

    const mpesaRef = 'B2C_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId,
      amount: withdrawAmount,
      type: 'WITHDRAW',
      status: 'SUCCESS',
      reference: mpesaRef,
      description: `Withdrew KES ${withdrawAmount} to M-Pesa number ${user.phone}`,
      createdAt: new Date().toISOString()
    });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      userId,
      action: 'WALLET_WITHDRAWAL',
      details: `Withdrew KES ${withdrawAmount} to M-Pesa number ${user.phone}. Ref: ${mpesaRef}`,
      timestamp: new Date().toISOString()
    });

    const updatedUser = await Database.getUser(userId);
    if (updatedUser) {
      emitSocket(req, `user_room_${userId}`, 'balance_updated', { balance: updatedUser.walletBalance });
    }
    
    return res.status(200).json({ success: true, user: updatedUser });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// --- CONTRACTS ROUTER ---

apiRouter.get('/contracts', async (req: Request, res: Response) => {
  try {
    const contracts = await Database.getContracts();
    const { userId } = req.query;
    if (userId) {
      const userContracts = contracts.filter(
        (c) => c.creatorId === userId || c.counterpartyId === userId
      );
      return res.status(200).json(userContracts);
    }
    const publicContracts = contracts.filter((c) => c.privacy !== 'Private');
    return res.status(200).json(publicContracts);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/contracts/:id', async (req: Request, res: Response) => {
  try {
    const contract = await Database.getContract(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    return res.status(200).json(contract);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/contracts', async (req: Request, res: Response) => {
  try {
    const {
      title,
      category,
      terms,
      termsList,
      stakeAmount,
      eventDate,
      settlementDeadline,
      expirationDate,
      trustedSource,
      trashTalk,
      privacy,
      creatorId,
      counterpartyUsername
    } = req.body;

    if (!title || !category || !stakeAmount || !eventDate || !creatorId) {
      return res.status(400).json({ error: 'Missing required contract fields' });
    }

    const stake = Number(stakeAmount);
    if (isNaN(stake) || stake <= 0) {
      return res.status(400).json({ error: 'Stake amount must be greater than zero' });
    }

    let parsedTermsList: string[] = [];
    if (termsList && Array.isArray(termsList)) {
      parsedTermsList = termsList.filter(t => t.trim() !== "");
    } else if (terms) {
      parsedTermsList = [terms.trim()];
    }

    if (parsedTermsList.length === 0) {
      return res.status(400).json({ error: 'At least one objective condition/term is required' });
    }

    const mergedTerms = terms || parsedTermsList.join('; ');

    let counterpartyId: string | undefined = undefined;
    if (counterpartyUsername) {
      const counterpartUser = await Database.getUser(counterpartyUsername.trim());
      if (!counterpartUser) {
        return res.status(400).json({ error: `User with username "${counterpartyUsername}" not found` });
      }
      if (counterpartUser.id === creatorId) {
        return res.status(400).json({ error: 'You cannot challenge yourself' });
      }
      counterpartyId = counterpartUser.id;
    }

    const newContract: Contract = {
      id: 'c_' + Math.random().toString(36).substring(2, 10),
      title: title.trim(),
      category: category as EventCategory,
      terms: mergedTerms,
      termsList: parsedTermsList,
      stakeAmount: stake,
      totalPot: stake * 2,
      creatorId,
      counterpartyId,
      creatorStatus: 'PENDING_FUND',
      counterpartyStatus: 'PENDING_FUND',
      status: counterpartyId ? 'AWAITING_FUNDING' : 'AWAITING_ACCEPTANCE',
      eventDate,
      settlementDeadline: settlementDeadline || new Date(new Date(eventDate).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      expirationDate: expirationDate || new Date(new Date(eventDate).getTime() - 1 * 60 * 60 * 1000).toISOString(),
      trustedSource: trustedSource?.trim() || undefined,
      trashTalk: trashTalk?.trim() || undefined,
      privacy: (privacy || 'Public') as PrivacySetting,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await Database.createContract(newContract);

    // If challenged a specific user, notify them in real-time
    if (counterpartyId) {
      emitSocket(req, `user_room_${counterpartyId}`, 'notification_received', {
        title: 'New Challenge Received! 🤝',
        contractId: saved.id
      });
    }

    // Broadcast update to global feed room (for public contracts)
    if (saved.privacy === 'Public') {
      emitSocket(req, 'global_feed', 'contract_created', saved);
    }

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId: saved.id,
      userId: creatorId,
      action: 'CONTRACT_CREATED',
      details: `Contract created by creator ${creatorId}. Stake KES ${stake}. Status: ${saved.status}`,
      timestamp: new Date().toISOString()
    });

    return res.status(201).json(saved);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/contracts/:id/accept', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    const updated = await EscrowService.acceptContract(req.params.id, userId);
    
    // Realtime notification & contract room update
    emitSocket(req, `contract_room_${updated.id}`, 'contract_updated', updated);
    emitSocket(req, `user_room_${updated.creatorId}`, 'notification_received', {
      title: 'Challenge Terms Accepted! 🤝',
      contractId: updated.id
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/contracts/:id/fund', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    const updated = await EscrowService.lockStake(req.params.id, userId);
    
    // Emit contract room change
    emitSocket(req, `contract_room_${updated.id}`, 'contract_updated', updated);
    
    // Update balance on front-end
    const user = await Database.getUser(userId);
    if (user) {
      emitSocket(req, `user_room_${userId}`, 'balance_updated', { balance: user.walletBalance });
    }

    // If active, alert both parties
    if (updated.status === 'ACTIVE') {
      emitSocket(req, `user_room_${updated.creatorId}`, 'notification_received', {
        title: 'Escrow Vault Active! 🔒',
        contractId: updated.id
      });
      emitSocket(req, `user_room_${updated.counterpartyId}`, 'notification_received', {
        title: 'Escrow Vault Active! 🔒',
        contractId: updated.id
      });
    }

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/contracts/:id/claim', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    const updated = await EscrowService.claimWin(req.params.id, userId);
    
    // Realtime update
    emitSocket(req, `contract_room_${updated.id}`, 'contract_updated', updated);
    
    const opponentId = updated.creatorId === userId ? updated.counterpartyId! : updated.creatorId;
    emitSocket(req, `user_room_${opponentId}`, 'notification_received', {
      title: 'Win Claimed - Action Required ⚠️',
      contractId: updated.id
    });

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/contracts/:id/settle', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    const updated = await EscrowService.approveSettlement(req.params.id, userId);
    
    // Realtime contract state change
    emitSocket(req, `contract_room_${updated.id}`, 'contract_updated', updated);
    
    // Notify both users in real-time
    emitSocket(req, `user_room_${updated.creatorId}`, 'notification_received', {
      title: 'Contract Settled 🤝',
      contractId: updated.id
    });
    emitSocket(req, `user_room_${updated.counterpartyId}`, 'notification_received', {
      title: 'Contract Settled 🤝',
      contractId: updated.id
    });

    // Push wallet balance updates
    const winnerUser = await Database.getUser(updated.winnerId!);
    const loserUser = await Database.getUser(userId);
    if (winnerUser) {
      emitSocket(req, `user_room_${winnerUser.id}`, 'balance_updated', { balance: winnerUser.walletBalance });
    }
    if (loserUser) {
      emitSocket(req, `user_room_${loserUser.id}`, 'balance_updated', { balance: loserUser.walletBalance });
    }

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/contracts/:id/dispute', async (req: Request, res: Response) => {
  try {
    const { userId, reason } = req.body;
    if (!userId || !reason) {
      return res.status(400).json({ error: 'User ID and reason required' });
    }
    const updated = await EscrowService.disputeClaim(req.params.id, userId, reason);
    
    emitSocket(req, `contract_room_${updated.id}`, 'contract_updated', updated);
    
    const claimantId = updated.claimedById!;
    emitSocket(req, `user_room_${claimantId}`, 'notification_received', {
      title: 'Contract in Dispute ⚖️',
      contractId: updated.id
    });

    // Alert admins
    emitSocket(req, 'admin_room', 'dispute_opened', { contractId: updated.id, disputeId: updated.disputeId });

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// --- PAYMENTS ROUTER ---

apiRouter.post('/payments/stkpush', async (req: Request, res: Response) => {
  try {
    const { phone, amount, contractId, userId } = req.body;
    if (!phone || !amount || !contractId || !userId) {
      return res.status(400).json({ error: 'Missing checkout parameters' });
    }

    const payload = {
      phone,
      amount: Number(amount),
      contractId,
      userId
    };

    const stkResponse = await MpesaService.initiateSTKPush(payload);
    return res.status(200).json(stkResponse);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/payments/callback', async (req: Request, res: Response) => {
  try {
    const { checkoutRequestId, success } = req.body;
    if (!checkoutRequestId) {
      return res.status(400).json({ error: 'Checkout request ID is required' });
    }

    const tx = await MpesaService.handleCallback(checkoutRequestId, success === true);
    if (!tx) {
      return res.status(404).json({ error: 'Pending transaction matching checkout ID not found' });
    }

    // Emit balance update to user in real time
    const user = await Database.getUser(tx.userId);
    if (user) {
      emitSocket(req, `user_room_${tx.userId}`, 'balance_updated', { balance: user.walletBalance });
      emitSocket(req, `user_room_${tx.userId}`, 'mpesa_payment_completed', { success: success === true, amount: tx.amount });
    }

    return res.status(200).json({ success: true, transaction: tx });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// --- ADMIN DISPUTES ROUTER ---

apiRouter.get('/disputes', async (req: Request, res: Response) => {
  try {
    const disputes = await Database.getDisputes();
    return res.status(200).json(disputes);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/disputes/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { winnerId, notes } = req.body;
    if (!winnerId || !notes) {
      return res.status(400).json({ error: 'Winner ID and settlement notes required' });
    }
    const resolved = await EscrowService.adminResolveDispute(req.params.id, winnerId, notes);
    
    // Broadcast contract & users updates
    const contract = await Database.getContract(resolved.contractId);
    if (contract) {
      emitSocket(req, `contract_room_${contract.id}`, 'contract_updated', contract);
      emitSocket(req, `user_room_${contract.creatorId}`, 'notification_received', { title: 'Dispute Resolved ⚖️', contractId: contract.id });
      emitSocket(req, `user_room_${contract.counterpartyId}`, 'notification_received', { title: 'Dispute Resolved ⚖️', contractId: contract.id });
      
      const u1 = await Database.getUser(contract.creatorId);
      const u2 = await Database.getUser(contract.counterpartyId!);
      if (u1) emitSocket(req, `user_room_${u1.id}`, 'balance_updated', { balance: u1.walletBalance });
      if (u2) emitSocket(req, `user_room_${u2.id}`, 'balance_updated', { balance: u2.walletBalance });
    }
    
    emitSocket(req, 'admin_room', 'dispute_resolved', resolved);

    return res.status(200).json(resolved);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/disputes/:id/refund', async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes) {
      return res.status(400).json({ error: 'Settlement notes required' });
    }
    const resolved = await EscrowService.adminRefundDispute(req.params.id, notes);
    
    // Broadcast contract & users updates
    const contract = await Database.getContract(resolved.contractId);
    if (contract) {
      emitSocket(req, `contract_room_${contract.id}`, 'contract_updated', contract);
      emitSocket(req, `user_room_${contract.creatorId}`, 'notification_received', { title: 'Stakes Refunded ⚖️', contractId: contract.id });
      emitSocket(req, `user_room_${contract.counterpartyId}`, 'notification_received', { title: 'Stakes Refunded ⚖️', contractId: contract.id });
      
      const u1 = await Database.getUser(contract.creatorId);
      const u2 = await Database.getUser(contract.counterpartyId!);
      if (u1) emitSocket(req, `user_room_${u1.id}`, 'balance_updated', { balance: u1.walletBalance });
      if (u2) emitSocket(req, `user_room_${u2.id}`, 'balance_updated', { balance: u2.walletBalance });
    }
    
    emitSocket(req, 'admin_room', 'dispute_resolved', resolved);

    return res.status(200).json(resolved);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// SYSTEM RESET FOR DEMO PURPOSES
apiRouter.post('/system/reset', async (req: Request, res: Response) => {
  try {
    await Database.resetDatabase();
    // Broadcast global reset signal
    const io = req.app.get('io');
    if (io) {
      io.emit('system_reset', { message: 'Database reset to initial seed values' });
    }
    return res.status(200).json({ success: true, message: 'Database reset to initial seed values' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
