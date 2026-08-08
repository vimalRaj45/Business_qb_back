import { TransactionService } from '../services/TransactionService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function transactionRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/transactions', async (request, reply) => {
    const transactions = await TransactionService.getTransactions(request.session, request.query || {});
    return { success: true, data: transactions };
  });
}
