import crypto from 'crypto';
import { BusinessService } from '../services/BusinessService.js';
import { EmailService } from '../services/EmailService.js';
import { requireWebSession, requireOwner } from '../middleware/authMiddleware.js';

export async function businessRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  // Get Business Profile
  fastify.get('/api/business', async (request, reply) => {
    const business = await BusinessService.getBusinessProfile(request.session);
    return { success: true, data: business };
  });

  // Update Business Profile
  fastify.put('/api/business', async (request, reply) => {
    const updated = await BusinessService.updateBusinessProfile(request.session, request.body || {});
    return { success: true, data: updated };
  });

  // Complete Business Onboarding Setup
  fastify.post('/api/business/onboarding', async (request, reply) => {
    try {
      const updated = await BusinessService.completeOnboarding(request.session, request.body || {});
      return { success: true, data: updated, message: 'Business onboarding completed successfully!' };
    } catch (err) {
      console.error('Onboarding error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'ONBOARDING_FAILED', message: err.message }
      });
    }
  });

  // Delete Business Account & Google Drive File (Owner Only)
  fastify.delete('/api/business', { preHandler: [requireOwner] }, async (request, reply) => {
    try {
      const res = await BusinessService.deleteAccount(request.session);
      return { success: true, message: res.message };
    } catch (err) {
      console.error('Delete business account error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DELETE_ACCOUNT_FAILED', message: err.message }
      });
    }
  });

  // Create Owned Business Spreadsheet (On-demand for staff members in Settings)
  fastify.post('/api/business/create-owned', async (request, reply) => {
    try {
      const { AuthService } = await import('../services/AuthService.js');
      const { GoogleSheetsRepository } = await import('../repositories/GoogleSheetsRepository.js');
      
      const { user, tokens } = request.session;
      const googleId = user.googleId;
      const businessId = `biz_${crypto.createHash('md5').update(googleId).digest('hex').substring(0, 12)}`;
      const now = new Date().toISOString();

      let ownedBusiness = {
        business_id: businessId,
        owner_google_id: googleId,
        business_name: `${user.name || 'My'}'s Business`,
        business_type: '',
        email: user.email || '',
        phone: '',
        address: '',
        city: '',
        state: '',
        country: '',
        pincode: '',
        tax_number: '',
        currency: 'USD $',
        logo_url: user.picture || '',
        spreadsheet_id: '',
        invoice_prefix: 'INV-',
        quotation_prefix: 'QUO-',
        onboarding_completed: false,
        created_at: now,
        updated_at: now
      };

      const sheetRes = await GoogleSheetsRepository.ensureBusinessSpreadsheet(tokens, {
        spreadsheet_id: '',
        business_name: ownedBusiness.business_name,
        owner_google_id: googleId
      });

      if (sheetRes && sheetRes.spreadsheetId) {
        ownedBusiness.spreadsheet_id = sheetRes.spreadsheetId;
        await GoogleSheetsRepository.updateRow(tokens, sheetRes.spreadsheetId, 'Business', 'business_id', businessId, ownedBusiness).catch(() => {});
      }

      request.session.ownedBusiness = ownedBusiness;
      request.session.business = ownedBusiness;
      request.session.role = 'owner';
      request.session.workspaces = [
        {
          business_id: ownedBusiness.business_id,
          business_name: ownedBusiness.business_name,
          role: 'owner',
          is_owner: true
        },
        ...(request.session.joinedWorkspaces || []).map(j => ({
          business_id: j.business_id,
          business_name: j.business_name,
          role: j.role,
          is_owner: false
        }))
      ];

      AuthService.saveSession(request.session.sessionToken, request.session);

      return {
        success: true,
        message: 'Personal business spreadsheet created!',
        business: ownedBusiness
      };
    } catch (err) {
      return reply.status(500).send({ success: false, error: { code: 'CREATE_OWNED_FAILED', message: err.message } });
    }
  });

  // Send Email OTP via Brevo API
  fastify.post('/api/business/send-otp', async (request, reply) => {
    try {
      const { email } = request.body || {};
      if (!email) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_EMAIL', message: 'Email address is required' }
        });
      }

      await EmailService.sendOTPEmail(email);
      return { success: true, message: `OTP code sent to ${email}` };
    } catch (err) {
      console.error('Send OTP error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'OTP_SEND_ERROR', message: err.message }
      });
    }
  });

  // Verify Email OTP Code
  fastify.post('/api/business/verify-otp', async (request, reply) => {
    try {
      const { email, code } = request.body || {};
      if (!email || !code) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Email and OTP code are required' }
        });
      }

      const result = EmailService.verifyOTP(email, code);
      if (!result.valid) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_OTP', message: result.message }
        });
      }

      return { success: true, message: 'OTP verified successfully' };
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: { code: 'VERIFY_OTP_ERROR', message: err.message }
      });
    }
  });
}
