import { PaymentService } from '../services/PaymentService.js';
import { requireWebSession, requireOwner } from '../middleware/authMiddleware.js';

export async function paymentRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/payments', async (request, reply) => {
    const payments = await PaymentService.getPayments(request.session);
    return { success: true, data: payments };
  });

  fastify.post('/api/payments', async (request, reply) => {
    const payment = await PaymentService.recordPayment(request.session, request.body || {});
    return { success: true, data: payment };
  });

  fastify.delete('/api/payments/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    try {
      await PaymentService.deletePayment(request.session, request.params.id);
      return { success: true, message: 'Payment deleted successfully' };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'DELETE_FAILED', message: err.message } });
    }
  });
}
