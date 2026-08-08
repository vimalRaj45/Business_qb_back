import { BusinessService } from '../services/BusinessService.js';
import { EmailService } from '../services/EmailService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

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

      return { success: true, message: 'Email verified successfully!' };
    } catch (err) {
      console.error('Verify OTP error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'OTP_VERIFY_ERROR', message: err.message }
      });
    }
  });

  // Onboarding Wizard
  fastify.post('/api/business/onboarding', async (request, reply) => {
    const updated = await BusinessService.completeOnboarding(request.session, request.body || {});
    return { success: true, data: updated };
  });

  // Delete Account & Wipe Google Drive Spreadsheet Data
  fastify.delete('/api/business/account', async (request, reply) => {
    try {
      const res = await BusinessService.deleteAccount(request.session);
      reply.clearCookie('session_token', { path: '/' });
      return { success: true, message: res.message };
    } catch (err) {
      console.error('Delete account error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DELETE_ACCOUNT_ERROR', message: err.message }
      });
    }
  });
}
