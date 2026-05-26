import { Database } from '../db/db';
import { Transaction } from '../types';

export interface STKPushRequest {
  phone: string;
  amount: number;
  contractId: string;
  userId: string;
}

export interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export class MpesaService {
  /**
   * Simulates an M-Pesa Daraja OAuth access token request
   */
  static async getAccessToken(): Promise<string> {
    return 'mpesa_oauth_token_simulated_' + Math.random().toString(36).substring(2);
  }

  /**
   * Simulates M-Pesa Daraja STK Push (Lipa na M-Pesa Online API)
   * In production, this would send an HTTP POST request to:
   * https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest (Sandbox)
   * or the live production API gateway.
   */
  static async initiateSTKPush(req: STKPushRequest): Promise<STKPushResponse> {
    const checkoutRequestId = 'ws_CO_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const merchantRequestId = 'mr_' + Math.random().toString(36).substring(2, 10);

    // Create a pending transaction record
    const pendingTx: Transaction = {
      id: 'tx_' + Math.random().toString(36).substring(2, 12),
      userId: req.userId,
      amount: req.amount,
      type: 'DEPOSIT',
      status: 'PENDING',
      reference: checkoutRequestId,
      description: `M-Pesa STK Deposit for Contract stake`,
      createdAt: new Date().toISOString()
    };
    await Database.createTransaction(pendingTx);

    // Create audit log
    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      contractId: req.contractId,
      userId: req.userId,
      action: 'MPESA_STK_PUSH_INITIATED',
      details: `STK Push of KES ${req.amount} initiated for phone ${req.phone}. Checkout ID: ${checkoutRequestId}`,
      timestamp: new Date().toISOString()
    });

    // In a normal setup, Safari responds immediately with the receipt confirmation of the request
    return {
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing'
    };
  }

  /**
   * Simulates M-Pesa STK Push Callback (Webhook) received from Safaricom.
   * This is called by our simulator UI or background job to trigger successful payment status.
   */
  static async handleCallback(checkoutRequestId: string, success: boolean): Promise<Transaction | null> {
    const txs = await Database.getAllTransactions();
    const tx = txs.find((t) => t.reference === checkoutRequestId);

    if (!tx || tx.status !== 'PENDING') {
      return null;
    }

    const updatedStatus = success ? 'SUCCESS' : 'FAILED';
    const mpesaTxId = 'MPESA_' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // Update the transaction status
    const updatedTx = await Database.updateTransaction(tx.id, {
      status: updatedStatus,
      reference: success ? mpesaTxId : tx.reference,
      description: success 
        ? `Deposited KES ${tx.amount} via M-Pesa (Ref: ${mpesaTxId})` 
        : `M-Pesa Deposit of KES ${tx.amount} failed`
    });

    // If successful, credit the user's wallet balance
    if (success) {
      const user = await Database.getUser(tx.userId);
      if (user) {
        await Database.updateUser(user.id, {
          walletBalance: user.walletBalance + tx.amount
        });
      }
    }

    await Database.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 12),
      userId: tx.userId,
      action: success ? 'MPESA_STK_PUSH_SUCCESS' : 'MPESA_STK_PUSH_FAILED',
      details: success 
        ? `M-Pesa STK Push succeeded. Credited wallet KES ${tx.amount}. M-Pesa Ref: ${mpesaTxId}`
        : `M-Pesa STK Push failed or cancelled by user. Checkout ID: ${checkoutRequestId}`,
      timestamp: new Date().toISOString()
    });

    return updatedTx;
  }
}
