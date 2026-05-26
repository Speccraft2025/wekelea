import { Database } from '../db/db';
import { Contract, User, Dispute } from '../types';

export class EscrowService {
  /**
   * Accepts a contract terms by a counterparty
   */
  static async acceptContract(contractId: string, counterpartyId: string): Promise<Contract> {
    const contract = await Database.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (contract.status !== 'AWAITING_ACCEPTANCE') {
      throw new Error('Contract is not in an acceptable state');
    }
    if (contract.creatorId === counterpartyId) {
      throw new Error('You cannot accept your own contract');
    }

    const updated = await Database.updateContract(contractId, {
      counterpartyId,
      status: 'AWAITING_FUNDING',
      updatedAt: new Date().toISOString()
    });

    // Notify creator
    const counterparty = await Database.getUser(counterpartyId);
    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: contract.creatorId,
      title: 'Challenge Terms Accepted! 🤝',
      message: `${counterparty?.username || 'Someone'} accepted the terms of your contract "${contract.title}". It is now awaiting funding from both parties.`,
      contractId,
      type: 'CONTRACT_INVITE',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId,
      action: 'CONTRACT_ACCEPTED',
      details: `Contract accepted by counterparty: ${counterpartyId}`,
      timestamp: new Date().toISOString()
    });

    return updated;
  }

  /**
   * Locks the stake for a user on a contract
   */
  static async lockStake(contractId: string, userId: string): Promise<Contract> {
    const contract = await Database.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (contract.status !== 'AWAITING_FUNDING') {
      throw new Error('Contract is not in a funding state');
    }

    const user = await Database.getUser(userId);
    if (!user) throw new Error('User not found');

    const isCreator = contract.creatorId === userId;
    const isCounterparty = contract.counterpartyId === userId;

    if (!isCreator && !isCounterparty) {
      throw new Error('User is not a participant in this contract');
    }

    // Double-spend check / Already funded check
    if (isCreator && contract.creatorStatus === 'FUNDED') {
      throw new Error('Creator has already funded the contract');
    }
    if (isCounterparty && contract.counterpartyStatus === 'FUNDED') {
      throw new Error('Counterparty has already funded the contract');
    }

    // Check if user has sufficient funds in their wallet
    if (user.walletBalance < contract.stakeAmount) {
      throw new Error('Insufficient wallet balance. Please load money via M-Pesa.');
    }

    // Deduct funds and create a LOCK transaction
    await Database.updateUser(userId, {
      walletBalance: user.walletBalance - contract.stakeAmount
    });

    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId,
      amount: contract.stakeAmount,
      type: 'LOCK',
      status: 'SUCCESS',
      reference: `LOCK_${contractId.substring(2)}_${userId}`,
      description: `Escrow stake locked for "${contract.title}"`,
      createdAt: new Date().toISOString()
    });

    // Update contract funding status
    const updatePayload: Partial<Contract> = {};
    if (isCreator) updatePayload.creatorStatus = 'FUNDED';
    if (isCounterparty) updatePayload.counterpartyStatus = 'FUNDED';

    let updatedContract = await Database.updateContract(contractId, updatePayload);

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId,
      userId,
      action: 'STAKE_LOCKED',
      details: `Staked KES ${contract.stakeAmount} locked by ${user.username}`,
      timestamp: new Date().toISOString()
    });

    // Check if both have funded to activate escrow
    if (
      updatedContract.creatorStatus === 'FUNDED' &&
      updatedContract.counterpartyStatus === 'FUNDED'
    ) {
      updatedContract = await Database.updateContract(contractId, {
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      });

      // Send notifications to both participants
      const participants = [contract.creatorId, contract.counterpartyId!];
      for (const pId of participants) {
        await Database.createNotification({
          id: 'n_' + Math.random().toString(36).substring(2, 12),
          userId: pId,
          title: 'Escrow Vault Active! 🔒',
          message: `Both parties have funded "${contract.title}". KES ${contract.totalPot} is now secured in Wekelea escrow. Settle arguments instantly!`,
          contractId,
          type: 'CONTRACT_ACTIVE',
          read: false,
          createdAt: new Date().toISOString()
        });
      }

      await Database.createAuditLog({
        id: 'log_' + Math.random().toString(36).substring(2, 12),
        contractId,
        action: 'CONTRACT_ACTIVE',
        details: `Escrow activated with total pot KES ${contract.totalPot}`,
        timestamp: new Date().toISOString()
      });
    }

    return updatedContract;
  }

  /**
   * Triggers a claim on a contract by a winner
   */
  static async claimWin(contractId: string, claimantId: string): Promise<Contract> {
    const contract = await Database.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (contract.status !== 'ACTIVE') {
      throw new Error('Contract must be ACTIVE to claim a win');
    }

    const isCreator = contract.creatorId === claimantId;
    const isCounterparty = contract.counterpartyId === claimantId;

    if (!isCreator && !isCounterparty) {
      throw new Error('User is not a participant in this contract');
    }

    const opponentId = isCreator ? contract.counterpartyId! : contract.creatorId;

    const updated = await Database.updateContract(contractId, {
      status: 'CLAIMED',
      claimedById: claimantId,
      winnerId: claimantId,
      updatedAt: new Date().toISOString()
    });

    const claimant = await Database.getUser(claimantId);
    const opponent = await Database.getUser(opponentId);

    // Notify opponent
    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: opponentId,
      title: 'Win Claimed - Action Required ⚠️',
      message: `${claimant?.username || 'Counterparty'} has claimed a win on contract "${contract.title}". Do you approve the settlement?`,
      contractId,
      type: 'CLAIM_MADE',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId,
      userId: claimantId,
      action: 'WIN_CLAIMED',
      details: `${claimant?.username} claimed win. Opponent ${opponent?.username} notification triggered.`,
      timestamp: new Date().toISOString()
    });

    return updated;
  }

  /**
   * Approves settlement and distributes funds
   */
  static async approveSettlement(contractId: string, approverId: string): Promise<Contract> {
    const contract = await Database.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (contract.status !== 'CLAIMED') {
      throw new Error('Contract is not in a claimed state');
    }

    const isCreator = contract.creatorId === approverId;
    const isCounterparty = contract.counterpartyId === approverId;

    if (!isCreator && !isCounterparty) {
      throw new Error('User is not a participant in this contract');
    }

    if (contract.claimedById === approverId) {
      throw new Error('You cannot approve your own claim');
    }

    const winnerId = contract.winnerId!;
    const winner = await Database.getUser(winnerId);
    const loser = await Database.getUser(approverId);
    if (!winner || !loser) throw new Error('User record missing');

    // 5% platform fee deduction
    const platformFee = contract.totalPot * 0.05;
    const payoutAmount = contract.totalPot - platformFee;

    // Release escrow to winner wallet
    await Database.updateUser(winnerId, {
      walletBalance: winner.walletBalance + payoutAmount,
      contractsCompleted: winner.contractsCompleted + 1,
      winStreak: winner.winStreak + 1,
      trustScore: Math.min(100, winner.trustScore + 1) // Increment trust score slightly on successful settlement
    });

    // Update loser count
    await Database.updateUser(approverId, {
      contractsCompleted: loser.contractsCompleted + 1,
      winStreak: 0, // Break streak
      trustScore: Math.min(100, loser.trustScore + 1) // Also slightly increment trust score for honest settlement consent
    });

    // Record UNLOCK and FEE transactions
    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: winnerId,
      amount: payoutAmount,
      type: 'UNLOCK',
      status: 'SUCCESS',
      reference: `RELEASE_${contractId.substring(2)}_${winnerId}`,
      description: `Escrow payout won for "${contract.title}" (Platform fee deducted)`,
      createdAt: new Date().toISOString()
    });

    // Log the platform fee deduction in ledger
    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: 'admin',
      amount: platformFee,
      type: 'FEE',
      status: 'SUCCESS',
      reference: `FEE_${contractId.substring(2)}`,
      description: `Wekelea 5% fee for contract "${contract.title}"`,
      createdAt: new Date().toISOString()
    });

    // Transfer fee to admin account
    const admin = await Database.getUser('admin');
    if (admin) {
      await Database.updateUser('admin', {
        walletBalance: admin.walletBalance + platformFee
      });
    }

    const updated = await Database.updateContract(contractId, {
      status: 'SETTLED',
      updatedAt: new Date().toISOString()
    });

    // Notify both users
    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: winnerId,
      title: 'Settled - Funds Received! 💰',
      message: `Your contract "${contract.title}" was settled. KES ${payoutAmount} (minus 5% fee) has been released to your wallet.`,
      contractId,
      type: 'SETTLEMENT_APPROVED',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: approverId,
      title: 'Contract Settled 🤝',
      message: `You approved settlement for "${contract.title}". Escrow was successfully released to ${winner.username}. Thank you for playing fair!`,
      contractId,
      type: 'SETTLEMENT_APPROVED',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId,
      action: 'ESCROW_RELEASED',
      details: `Escrow KES ${contract.totalPot} released. Winner: ${winner.username} received KES ${payoutAmount}. Platform Fee: KES ${platformFee}`,
      timestamp: new Date().toISOString()
    });

    return updated;
  }

  /**
   * Rejects claim and triggers formal Dispute state
   */
  static async disputeClaim(contractId: string, disputerId: string, reason: string): Promise<Contract> {
    const contract = await Database.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (contract.status !== 'CLAIMED') {
      throw new Error('Contract is not in a claim status');
    }

    const isCreator = contract.creatorId === disputerId;
    const isCounterparty = contract.counterpartyId === disputerId;

    if (!isCreator && !isCounterparty) {
      throw new Error('User is not a participant in this contract');
    }

    const claimantId = contract.claimedById!;
    const disputer = await Database.getUser(disputerId);
    const claimant = await Database.getUser(claimantId);

    const disputeId = 'd_' + Math.random().toString(36).substring(2, 12);
    await Database.createDispute({
      id: disputeId,
      contractId,
      openedById: disputerId,
      reason,
      status: 'OPEN',
      createdAt: new Date().toISOString()
    });

    const updated = await Database.updateContract(contractId, {
      status: 'DISPUTED',
      disputeId,
      updatedAt: new Date().toISOString()
    });

    // Notify claimant
    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: claimantId,
      title: 'Contract in Dispute ⚖️',
      message: `${disputer?.username} rejected your win claim on "${contract.title}" and opened a dispute. Reason: "${reason.substring(0, 50)}...". Admin review triggered.`,
      contractId,
      type: 'DISPUTE_OPENED',
      read: false,
      createdAt: new Date().toISOString()
    });

    // Decrement trust score slightly for both due to friction, but admin will restore or deduct further
    await Database.updateUser(disputerId, { trustScore: Math.max(50, disputer!.trustScore - 2) });
    await Database.updateUser(claimantId, { trustScore: Math.max(50, claimant!.trustScore - 2) });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId,
      userId: disputerId,
      action: 'DISPUTE_OPENED',
      details: `Dispute ${disputeId} opened by ${disputer?.username}. Escrow frozen. Reason: ${reason}`,
      timestamp: new Date().toISOString()
    });

    return updated;
  }

  /**
   * ADMIN ONLY: Arbitrate Dispute - Settle in favor of one party
   */
  static async adminResolveDispute(disputeId: string, winnerId: string, notes: string): Promise<Dispute> {
    const dispute = await Database.getDispute(disputeId);
    if (!dispute || dispute.status !== 'OPEN') {
      throw new Error('Open dispute not found');
    }

    const contract = await Database.getContract(dispute.contractId);
    if (!contract) throw new Error('Contract not found');

    const winner = await Database.getUser(winnerId);
    const creatorId = contract.creatorId;
    const counterpartyId = contract.counterpartyId!;
    const loserId = winnerId === creatorId ? counterpartyId : creatorId;
    const loser = await Database.getUser(loserId);

    if (!winner || !loser) throw new Error('User record missing');

    const platformFee = contract.totalPot * 0.05;
    const payoutAmount = contract.totalPot - platformFee;

    // Release escrow to chosen winner
    await Database.updateUser(winnerId, {
      walletBalance: winner.walletBalance + payoutAmount,
      contractsCompleted: winner.contractsCompleted + 1,
      trustScore: Math.min(100, winner.trustScore + 3) // Restore and reward honest player
    });

    // Loser penalty (larger hit to trust score)
    await Database.updateUser(loserId, {
      contractsCompleted: loser.contractsCompleted + 1,
      winStreak: 0,
      trustScore: Math.max(30, loser.trustScore - 10) // Heavy penalty for bad faith disputing
    });

    // Record UNLOCK and FEE transactions
    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: winnerId,
      amount: payoutAmount,
      type: 'UNLOCK',
      status: 'SUCCESS',
      reference: `ADMIN_RELEASE_${contract.id.substring(2)}_${winnerId}`,
      description: `Admin resolved escrow in your favor for "${contract.title}"`,
      createdAt: new Date().toISOString()
    });

    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: 'admin',
      amount: platformFee,
      type: 'FEE',
      status: 'SUCCESS',
      reference: `ADMIN_FEE_${contract.id.substring(2)}`,
      description: `Wekelea admin resolution fee for contract "${contract.title}"`,
      createdAt: new Date().toISOString()
    });

    // Transfer fee to admin account
    const admin = await Database.getUser('admin');
    if (admin) {
      await Database.updateUser('admin', {
        walletBalance: admin.walletBalance + platformFee
      });
    }

    // Update contract
    await Database.updateContract(contract.id, {
      status: 'SETTLED',
      winnerId,
      updatedAt: new Date().toISOString()
    });

    // Update dispute
    const updatedDispute = await Database.updateDispute(disputeId, {
      status: 'RESOLVED',
      resolvedById: 'admin',
      resolutionDetails: `Arbitrated in favor of ${winner.username}. Admin notes: "${notes}"`,
      resolvedAt: new Date().toISOString()
    });

    // Notify both users
    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: winnerId,
      title: 'Dispute Resolved in Your Favor! ⚖️',
      message: `Admin arbitrated the dispute for "${contract.title}" in your favor. KES ${payoutAmount} released to wallet.`,
      contractId: contract.id,
      type: 'ADMIN_ACTION',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: loserId,
      title: 'Dispute Settlement Finalized ⚖️',
      message: `Admin arbitrated the dispute for "${contract.title}" in favor of ${winner.username}. Escrow released.`,
      contractId: contract.id,
      type: 'ADMIN_ACTION',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId: contract.id,
      action: 'ADMIN_DISPUTE_RESOLVED',
      details: `Dispute resolved by Admin. Winner: ${winner.username}. Platform fee KES ${platformFee} collected. Admin Notes: ${notes}`,
      timestamp: new Date().toISOString()
    });

    return updatedDispute;
  }

  /**
   * ADMIN ONLY: Arbitrate Dispute - Refund both parties (no platform fee collected on refund)
   */
  static async adminRefundDispute(disputeId: string, notes: string): Promise<Dispute> {
    const dispute = await Database.getDispute(disputeId);
    if (!dispute || dispute.status !== 'OPEN') {
      throw new Error('Open dispute not found');
    }

    const contract = await Database.getContract(dispute.contractId);
    if (!contract) throw new Error('Contract not found');

    const creatorId = contract.creatorId;
    const counterpartyId = contract.counterpartyId!;
    const creator = await Database.getUser(creatorId);
    const counterparty = await Database.getUser(counterpartyId);

    if (!creator || !counterparty) throw new Error('User record missing');

    // Refund full stake amount back to both wallets
    await Database.updateUser(creatorId, {
      walletBalance: creator.walletBalance + contract.stakeAmount,
      trustScore: Math.min(100, creator.trustScore + 2) // Restore trust score
    });

    await Database.updateUser(counterpartyId, {
      walletBalance: counterparty.walletBalance + contract.stakeAmount,
      trustScore: Math.min(100, counterparty.trustScore + 2) // Restore trust score
    });

    // Record REFUND transactions
    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: creatorId,
      amount: contract.stakeAmount,
      type: 'UNLOCK',
      status: 'SUCCESS',
      reference: `REFUND_C_${contract.id.substring(2)}`,
      description: `Refund for contract "${contract.title}" due to admin dispute decision`,
      createdAt: new Date().toISOString()
    });

    await Database.createTransaction({
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: counterpartyId,
      amount: contract.stakeAmount,
      type: 'UNLOCK',
      status: 'SUCCESS',
      reference: `REFUND_CP_${contract.id.substring(2)}`,
      description: `Refund for contract "${contract.title}" due to admin dispute decision`,
      createdAt: new Date().toISOString()
    });

    // Update contract
    await Database.updateContract(contract.id, {
      status: 'REFUNDED',
      updatedAt: new Date().toISOString()
    });

    // Update dispute
    const updatedDispute = await Database.updateDispute(disputeId, {
      status: 'REFUNDED',
      resolvedById: 'admin',
      resolutionDetails: `Arbitrated to fully refund both parties. Admin notes: "${notes}"`,
      resolvedAt: new Date().toISOString()
    });

    // Notify both users
    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: creatorId,
      title: 'Stakes Refunded by Admin ⚖️',
      message: `Admin cancelled the disputed contract "${contract.title}" and refunded your stake of KES ${contract.stakeAmount}.`,
      contractId: contract.id,
      type: 'ADMIN_ACTION',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createNotification({
      id: 'n_' + Math.random().toString(36).substring(2, 12),
      userId: counterpartyId,
      title: 'Stakes Refunded by Admin ⚖️',
      message: `Admin cancelled the disputed contract "${contract.title}" and refunded your stake of KES ${contract.stakeAmount}.`,
      contractId: contract.id,
      type: 'ADMIN_ACTION',
      read: false,
      createdAt: new Date().toISOString()
    });

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId: contract.id,
      action: 'ADMIN_DISPUTE_REFUNDED',
      details: `Dispute refunded by Admin. Full refund of KES ${contract.stakeAmount} returned to both parties. Admin Notes: ${notes}`,
      timestamp: new Date().toISOString()
    });

    return updatedDispute;
  }
}
