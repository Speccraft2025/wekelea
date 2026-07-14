/**
 * Daraja (Safaricom M-Pesa) STK Push integration.
 *
 * Two modes, chosen automatically from the environment:
 *   • REAL     — when MPESA_CONSUMER_KEY / SECRET are set: performs a genuine
 *                OAuth + STK Push against the Daraja sandbox/production gateway.
 *   • SIMULATED — otherwise: returns a synthetic CheckoutRequestID and relies on
 *                the frontend to trigger /api/payments/callback (demo mode).
 */

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

const BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

export function isDarajaConfigured(): boolean {
  return Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET);
}

/** Normalize a Kenyan MSISDN to 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizeMsisdn(phone: string): string {
  let p = (phone || '').trim().replace(/\D/g, '');
  if (p.startsWith('0')) p = '254' + p.substring(1);
  else if (p.startsWith('7') || p.startsWith('1')) p = '254' + p;
  else if (p.startsWith('+')) p = p.substring(1);
  return p;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  );
}

async function getAccessToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY!;
  const secret = process.env.MPESA_CONSUMER_SECRET!;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Daraja OAuth failed (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Daraja OAuth returned no access_token');
  return json.access_token as string;
}

/** Kick off an STK push. In simulated mode, returns a synthetic response. */
export async function initiateSTKPush(req: STKPushRequest): Promise<STKPushResponse> {
  if (!isDarajaConfigured()) {
    const checkoutRequestId =
      'ws_CO_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    return {
      MerchantRequestID: 'mr_' + Math.random().toString(36).substring(2, 10),
      CheckoutRequestID: checkoutRequestId,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing (simulated)',
      CustomerMessage: 'Success. Request accepted for processing',
    };
  }

  const shortcode = process.env.MPESA_SHORTCODE || '174379';
  const passkey = process.env.MPESA_PASSKEY!;
  const callbackUrl = process.env.MPESA_CALLBACK_URL!;
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
  const token = await getAccessToken();

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.max(1, Math.round(req.amount)),
    PartyA: normalizeMsisdn(req.phone),
    PartyB: shortcode,
    PhoneNumber: normalizeMsisdn(req.phone),
    CallBackURL: callbackUrl,
    AccountReference: 'Wekelea',
    TransactionDesc: `Wekelea escrow stake ${req.contractId}`,
  };

  const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.ResponseCode !== '0') {
    throw new Error(json.errorMessage || json.ResponseDescription || 'STK push failed');
  }
  return json as STKPushResponse;
}

export interface ParsedCallback {
  checkoutRequestId: string;
  success: boolean;
  mpesaReceipt?: string;
}

/**
 * Parse either shape of callback into a normalized result:
 *   • Real Daraja  → { Body: { stkCallback: { CheckoutRequestID, ResultCode, CallbackMetadata } } }
 *   • Simulated    → { checkoutRequestId, success }
 */
export function parseCallback(payload: any): ParsedCallback | null {
  // Real Daraja callback
  const stk = payload?.Body?.stkCallback;
  if (stk && stk.CheckoutRequestID) {
    const success = stk.ResultCode === 0 || stk.ResultCode === '0';
    let receipt: string | undefined;
    const items = stk.CallbackMetadata?.Item as Array<{ Name: string; Value: any }> | undefined;
    if (items) {
      const r = items.find((i) => i.Name === 'MpesaReceiptNumber');
      if (r) receipt = String(r.Value);
    }
    return { checkoutRequestId: stk.CheckoutRequestID, success, mpesaReceipt: receipt };
  }
  // Simulated callback from the frontend
  if (payload?.checkoutRequestId) {
    return { checkoutRequestId: payload.checkoutRequestId, success: payload.success === true };
  }
  return null;
}
