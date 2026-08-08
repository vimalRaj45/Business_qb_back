import { ReportService } from '../services/ReportService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function reportRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/reports/summary', async (request, reply) => {
    const summary = await ReportService.getSummary(request.session);
    return { success: true, data: summary };
  });

  fastify.get('/api/reports/sales', async (request, reply) => {
    const report = await ReportService.getSalesReport(request.session);
    return { success: true, data: report };
  });

  fastify.get('/api/reports/expenses', async (request, reply) => {
    const report = await ReportService.getExpenseReport(request.session);
    return { success: true, data: report };
  });

  fastify.get('/api/reports/profit-loss', async (request, reply) => {
    const report = await ReportService.getProfitLoss(request.session);
    return { success: true, data: report };
  });

  fastify.get('/api/reports/customers', async (request, reply) => {
    const report = await ReportService.getCustomerReport(request.session);
    return { success: true, data: report };
  });

  fastify.get('/api/reports/tax', async (request, reply) => {
    const report = await ReportService.getTaxReport(request.session);
    return { success: true, data: report };
  });
}
