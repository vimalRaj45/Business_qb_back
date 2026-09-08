import { SubscriptionService } from '../services/SubscriptionService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function subscriptionRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  // Get current subscription & invoice usage status
  fastify.get('/api/subscription/status', async (request, reply) => {
    try {
      const status = await SubscriptionService.getSubscriptionStatus(request.session);
      return { success: true, data: status };
    } catch (err) {
      console.error('Subscription status error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'SUB_STATUS_ERROR', message: err.message }
      });
    }
  });

  // Create Razorpay Order for ₹100/mo Pro Plan
  fastify.post('/api/subscription/create-order', async (request, reply) => {
    try {
      const order = await SubscriptionService.createOrder(request.session);
      return { success: true, data: order };
    } catch (err) {
      console.error('Create subscription order error:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'CREATE_ORDER_FAILED', message: err.message }
      });
    }
  });

  // Verify Razorpay Payment Signature & Activate Pro
  fastify.post('/api/subscription/verify', async (request, reply) => {
    try {
      const result = await SubscriptionService.verifyAndActivateSubscription(request.session, request.body);
      return { success: true, ...result };
    } catch (err) {
      console.error('Verify subscription payment error:', err);
      return reply.status(400).send({
        success: false,
        error: { code: 'PAYMENT_VERIFICATION_FAILED', message: err.message }
      });
    }
  });
}
