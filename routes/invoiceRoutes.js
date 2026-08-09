import { InvoiceService } from '../services/InvoiceService.js';
import { PaymentService } from '../services/PaymentService.js';
import { UserEmailService } from '../services/UserEmailService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function invoiceRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/invoices', async (request, reply) => {
    try {
      const invoices = await InvoiceService.getInvoices(request.session);
      return { success: true, data: invoices };
    } catch (err) {
      console.error('Error in GET /api/invoices:', err);
      return reply.status(500).send({ success: false, error: { code: 'INVOICE_FETCH_ERROR', message: err.message } });
    }
  });

  fastify.get('/api/invoices/:id', async (request, reply) => {
    try {
      const invoice = await InvoiceService.getInvoiceById(request.session, request.params.id);
      if (!invoice) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
      }
      return { success: true, data: invoice };
    } catch (err) {
      console.error('Error in GET /api/invoices/:id:', err);
      return reply.status(500).send({ success: false, error: { code: 'INVOICE_FETCH_ERROR', message: err.message } });
    }
  });

  fastify.post('/api/invoices', async (request, reply) => {
    try {
      const invoice = await InvoiceService.createInvoice(request.session, request.body || {});
      return { success: true, data: invoice };
    } catch (err) {
      console.error('Error in POST /api/invoices:', err);
      return reply.status(500).send({ success: false, error: { code: 'INVOICE_CREATE_ERROR', message: err.message } });
    }
  });

  // Record payment for specific invoice
  fastify.post('/api/invoices/:id/payments', async (request, reply) => {
    try {
      const payload = {
        invoice_id: request.params.id,
        ...(request.body || {})
      };
      const payment = await PaymentService.recordPayment(request.session, payload);
      return { success: true, data: payment, message: 'Payment recorded successfully' };
    } catch (err) {
      console.error('Error in POST /api/invoices/:id/payments:', err);
      return reply.status(400).send({ success: false, error: { code: 'PAYMENT_FAILED', message: err.message } });
    }
  });

  // Send Invoice Email via logged-in user's Gmail
  fastify.post('/api/invoices/:id/send-email', async (request, reply) => {
    try {
      const { email } = request.body || {};
      const res = await UserEmailService.sendInvoiceEmail(request.session, request.params.id, email);
      return { success: true, message: res.message };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'GMAIL_SEND_FAILED', message: err.message } });
    }
  });

  fastify.put('/api/invoices/:id', async (request, reply) => {
    try {
      const updated = await InvoiceService.updateInvoice(request.session, request.params.id, request.body || {});
      return { success: true, data: updated };
    } catch (err) {
      console.error('Error in PUT /api/invoices/:id:', err);
      return reply.status(500).send({ success: false, error: { code: 'INVOICE_UPDATE_ERROR', message: err.message } });
    }
  });
}
