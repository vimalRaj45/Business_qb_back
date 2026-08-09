import { ExpenseService } from '../services/ExpenseService.js';
import { requireWebSession, requireOwner } from '../middleware/authMiddleware.js';

export async function expenseRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/expenses', async (request, reply) => {
    const expenses = await ExpenseService.getExpenses(request.session);
    return { success: true, data: expenses };
  });

  fastify.post('/api/expenses', async (request, reply) => {
    const expense = await ExpenseService.createExpense(request.session, request.body || {});
    return { success: true, data: expense };
  });

  fastify.delete('/api/expenses/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    try {
      await ExpenseService.deleteExpense(request.session, request.params.id);
      return { success: true, message: 'Expense deleted successfully' };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'DELETE_FAILED', message: err.message } });
    }
  });
}
