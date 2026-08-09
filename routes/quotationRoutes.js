import { QuotationService } from '../services/QuotationService.js';
import { UserEmailService } from '../services/UserEmailService.js';
import { requireWebSession, requireOwner } from '../middleware/authMiddleware.js';

export async function quotationRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/quotations', async (request, reply) => {
    const quotations = await QuotationService.getQuotations(request.session);
    return { success: true, data: quotations };
  });

  fastify.get('/api/quotations/:id', async (request, reply) => {
    const quotation = await QuotationService.getQuotationById(request.session, request.params.id);
    if (!quotation) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
    }
    return { success: true, data: quotation };
  });

  fastify.post('/api/quotations', async (request, reply) => {
    const quotation = await QuotationService.createQuotation(request.session, request.body || {});
    return { success: true, data: quotation };
  });

  fastify.put('/api/quotations/:id/status', async (request, reply) => {
    const { status } = request.body || {};
    const updated = await QuotationService.updateQuotationStatus(request.session, request.params.id, status);
    return { success: true, data: updated };
  });

  fastify.post('/api/quotations/:id/convert', async (request, reply) => {
    try {
      const invoice = await QuotationService.convertToInvoice(request.session, request.params.id);
      return { success: true, data: invoice, message: 'Quotation successfully converted to Invoice' };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'CONVERSION_FAILED', message: err.message } });
    }
  });

  // Send Quotation Email via logged-in user's Gmail
  fastify.post('/api/quotations/:id/send-email', async (request, reply) => {
    try {
      const { email } = request.body || {};
      const res = await UserEmailService.sendQuotationEmail(request.session, request.params.id, email);
      return { success: true, message: res.message };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'GMAIL_SEND_FAILED', message: err.message } });
    }
  });

  // Delete Quotation (Owner Only)
  fastify.delete('/api/quotations/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    try {
      await QuotationService.deleteQuotation(request.session, request.params.id);
      return { success: true, message: 'Quotation deleted successfully' };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'DELETE_FAILED', message: err.message } });
    }
  });
}
