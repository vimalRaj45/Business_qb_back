import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { AuthService } from './AuthService.js';

export const FREE_INVOICE_LIMIT = 10;
export const PRO_MONTHLY_PRICE_INR = 100; // ₹100 / month

export class SubscriptionService {
  static getRazorpayInstance() {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return null;
    }
    return new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
  }

  static generateSignature(businessId, expiresAt, paymentId) {
    const secret = env.SESSION_SECRET || 'bizsheet_secure_hash_secret_key';
    return crypto
      .createHmac('sha256', secret)
      .update(`${businessId}:${expiresAt}:${paymentId}`)
      .digest('hex');
  }

  static isSubscriptionValid(business) {
    if (!business || business.subscription_status !== 'active') return false;
    const expiresAt = business.subscription_expires_at ? new Date(business.subscription_expires_at) : null;
    if (!expiresAt || expiresAt <= new Date()) return false;

    // Verify cryptographic signature against server secret
    const expectedSig = this.generateSignature(
      business.business_id,
      business.subscription_expires_at,
      business.subscription_last_payment_id || ''
    );

    if (business.subscription_signature !== expectedSig) {
      console.warn(`🚨 [SECURITY ALERT] Manual subscription tampering detected for business ${business.business_id}. Rejected.`);
      return false;
    }

    return true;
  }

  /**
   * Returns current workspace subscription status and invoice count
   */
  static async getSubscriptionStatus(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) {
      return {
        isPro: false,
        plan: 'free',
        status: 'free',
        invoiceCount: 0,
        freeLimit: FREE_INVOICE_LIMIT,
        remainingFreeInvoices: FREE_INVOICE_LIMIT,
        canCreateInvoice: true,
        daysLeft: 0,
        razorpayKeyId: env.RAZORPAY_KEY_ID || ''
      };
    }

    let invoiceCount = 0;
    try {
      const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Invoices');
      invoiceCount = (Array.isArray(rows) ? rows : []).filter(r => r && r.business_id === business.business_id).length;
    } catch (err) {
      console.warn('Could not count invoices from sheet:', err.message);
    }

    const expiresAt = business.subscription_expires_at ? new Date(business.subscription_expires_at) : null;
    const isPro = this.isSubscriptionValid(business);
    const daysLeft = isPro && expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
    const canCreateInvoice = isPro || invoiceCount < FREE_INVOICE_LIMIT;

    return {
      isPro,
      plan: isPro ? (business.subscription_plan || 'pro_monthly') : 'free',
      status: isPro ? 'active' : (invoiceCount >= FREE_INVOICE_LIMIT ? 'limit_reached' : 'free'),
      invoiceCount,
      freeLimit: FREE_INVOICE_LIMIT,
      remainingFreeInvoices: Math.max(0, FREE_INVOICE_LIMIT - invoiceCount),
      canCreateInvoice,
      subscriptionExpiresAt: business.subscription_expires_at || null,
      daysLeft,
      proMonthlyPrice: PRO_MONTHLY_PRICE_INR,
      razorpayKeyId: env.RAZORPAY_KEY_ID || ''
    };
  }

  /**
   * Create Razorpay Order for Pro Subscription (₹100)
   */
  static async createOrder(session) {
    const { business } = session;
    const amountInPaise = PRO_MONTHLY_PRICE_INR * 100; // 10000 paise = ₹100

    const razorpay = this.getRazorpayInstance();

    // If Razorpay API credentials are not yet set in .env, generate simulated dev order
    if (!razorpay) {
      console.warn('⚠️ RAZORPAY_KEY_ID/SECRET not configured in .env. Providing mock order for testing.');
      const mockOrderId = `order_mock_${Date.now()}`;
      return {
        orderId: mockOrderId,
        amount: amountInPaise,
        currency: 'INR',
        keyId: 'rzp_test_placeholder',
        isMock: true,
        businessName: business.business_name || 'My Business',
        description: 'Bizsheet Pro Monthly Plan — Unlimited Invoices for 30 Days'
      };
    }

    const receipt = `sub_${business.business_id.substring(0, 8)}_${Date.now().toString().slice(-6)}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        business_id: business.business_id,
        business_name: business.business_name || 'My Business',
        plan: 'pro_monthly'
      }
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID,
      isMock: false,
      businessName: business.business_name || 'My Business',
      description: 'Bizsheet Pro Monthly Plan — Unlimited Invoices for 30 Days'
    };
  }

  /**
   * Verify Razorpay payment signature & unlock Pro for 30 days
   */
  static async verifyAndActivateSubscription(session, paymentData) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, is_mock } = paymentData || {};
    const { business, tokens, sessionToken } = session;

    // Handle mock payment in development
    if (is_mock && (!env.RAZORPAY_KEY_SECRET || env.NODE_ENV === 'development')) {
      console.log('🧪 Activated mock Pro subscription for testing');
      return this._activatePro(session, 'mock_pay_' + Date.now());
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new Error('Incomplete payment verification payload from Razorpay.');
    }

    if (!env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay Key Secret is not configured on the server.');
    }

    // Verify HMAC SHA-256 signature
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      throw new Error('Invalid Razorpay payment signature. Payment verification failed.');
    }

    return this._activatePro(session, razorpay_payment_id);
  }

  static async _activatePro(session, paymentReference) {
    const { business, tokens, sessionToken } = session;

    const now = new Date();
    // 30 days from now (or extend current active period if already Pro)
    let startDate = now;
    if (business.subscription_status === 'active' && business.subscription_expires_at) {
      const currentExpiry = new Date(business.subscription_expires_at);
      if (currentExpiry > now) {
        startDate = currentExpiry;
      }
    }

    const expiresAt = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const signature = this.generateSignature(business.business_id, expiresAt, paymentReference || '');

    const updatedData = {
      subscription_status: 'active',
      subscription_plan: 'pro_monthly',
      subscription_expires_at: expiresAt,
      subscription_last_payment_id: paymentReference || '',
      subscription_signature: signature,
      updated_at: new Date().toISOString()
    };

    Object.assign(session.business, updatedData);
    AuthService.saveSession(sessionToken, session);

    // Save to Google Sheets Business tab if available
    try {
      if (business.spreadsheet_id) {
        await GoogleSheetsRepository.updateRow(
          tokens,
          business.spreadsheet_id,
          'Business',
          'business_id',
          business.business_id,
          updatedData
        );
      }
    } catch (err) {
      console.warn('Could not save subscription status to Google Sheet:', err.message);
    }

    return {
      success: true,
      message: '🎉 Congratulations! Upgraded to Bizsheet Pro (₹100/mo). Unlimited invoices unlocked!',
      isPro: true,
      expiresAt
    };
  }
}
