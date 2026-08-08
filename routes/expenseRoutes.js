import { ExpenseService } from '../services/ExpenseService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function expenseRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/expenses', async (request, reply) => {
    const expenses = await ExpenseService.getExpenses(request.session);
    return { success: true, data: expenses };
  });

  fastify.post('/api/expenses', async (request, reply) => {
    const expense = await ExpenseService.createExpense(request.session, request.body || {});
    return { success: true, data: expense, message: 'Expense recorded successfully' };
  });
}
