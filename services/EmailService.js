import { env } from '../config/env.js';

const OTP_CACHE = new Map(); // Key: email, Value: { otp, expiresAt }

export class EmailService {
  
  static generateOTP(email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
    OTP_CACHE.set(email.toLowerCase().trim(), { otp, expiresAt });
    return otp;
  }

  static verifyOTP(email, code) {
    const key = email.toLowerCase().trim();
    const record = OTP_CACHE.get(key);
    if (!record) return { valid: false, message: 'No OTP requested for this email' };

    if (Date.now() > record.expiresAt) {
      OTP_CACHE.delete(key);
      return { valid: false, message: 'OTP code has expired. Please request a new one.' };
    }

    if (record.otp === code.trim()) {
      OTP_CACHE.delete(key);
      return { valid: true, message: 'OTP verified successfully!' };
    }

    return { valid: false, message: 'Invalid OTP code. Please check your email and try again.' };
  }

  static async sendOTPEmail(targetEmail) {
    const cleanEmail = targetEmail.toLowerCase().trim();
    const otp = this.generateOTP(cleanEmail);
    console.log(`🔑 [OTP GENERATED] Email: ${cleanEmail} | Code: ${otp}`);

    if (!env.BREVO_API_KEY) {
      console.warn('⚠️ BREVO_API_KEY not configured. Use the logged OTP code to complete verification.');
      return { success: true, email: cleanEmail, message: `OTP code [${otp}] generated for testing (Brevo key missing)` };
    }

    const brevoUrl = 'https://api.brevo.com/v3/smtp/email';
    const payload = {
      sender: {
        name: 'BizSheet Platform',
        email: env.BREVO_SENDER
      },
      to: [
        { email: cleanEmail }
      ],
      subject: `[${otp}] Your Verification Code - BizSheet Platform`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #0d9488; color: #ffffff; border-radius: 12px; font-size: 24px; line-height: 48px; font-weight: bold;">
              ✓
            </div>
            <h2 style="color: #0f172a; margin-top: 12px; margin-bottom: 4px;">Verify Your Email Address</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">BizSheet Business Billing Platform</p>
          </div>

          <div style="background: #f8fafc; border: 1px border #e2e8f0; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
            <p style="color: #475569; font-size: 12px; text-transform: uppercase; tracking: 1px; margin-top: 0; font-weight: bold;">Your 6-Digit OTP Code</p>
            <div style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #0d9488; font-family: monospace;">${otp}</div>
            <p style="color: #94a3b8; font-size: 11px; margin-bottom: 0; margin-top: 8px;">Valid for 10 minutes. Do not share this code with anyone.</p>
          </div>

          <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
            If you did not request this verification code, please ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
          <p style="color: #cbd5e1; font-size: 10px; text-align: center;">&copy; 2026 BizSheet Platform. All rights reserved.</p>
        </div>
      `
    };

    try {
      const res = await fetch(brevoUrl, {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('❌ Brevo Email API error:', res.status, errText);
        // Fallback for invalid key in dev mode
        if (env.NODE_ENV === 'development') {
          return { success: true, email: cleanEmail, message: `OTP [${otp}] logged to console (Brevo error ${res.status})` };
        }
        throw new Error(`Brevo API Error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      console.log(`📧 Brevo OTP Email sent to ${cleanEmail}, messageId: ${data.messageId || 'ok'}`);
      return { success: true, email: cleanEmail };
    } catch (err) {
      if (env.NODE_ENV === 'development') {
        console.warn('⚠️ OTP delivery fallback used in dev:', err.message);
        return { success: true, email: cleanEmail, message: `OTP code [${otp}] ready for verification` };
      }
      throw err;
    }
  }
}
