import { PaymentService } from '../services/PaymentService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function paymentRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/payments', async (request, reply) => {
    const payments = await PaymentService.getPayments(request.session);
    return { success: true, data: payments };
  });

  fastify.post('/api/payments', async (request, reply) => {
    try {
      const payment = await PaymentService.recordPayment(request.session, request.body || {});
      return { success: true, data: payment, message: 'Payment recorded successfully' };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'PAYMENT_FAILED', message: err.message } });
    }
  });
}
