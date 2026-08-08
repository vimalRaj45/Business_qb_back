import { requireApiKey, requirePermission } from '../middleware/authMiddleware.js';
import { CustomerService } from '../services/CustomerService.js';
import { ProductService } from '../services/ProductService.js';
import { QuotationService } from '../services/QuotationService.js';
import { InvoiceService } from '../services/InvoiceService.js';
import { PaymentService } from '../services/PaymentService.js';
import { ExpenseService } from '../services/ExpenseService.js';
import { TransactionService } from '../services/TransactionService.js';
import { ReportService } from '../services/ReportService.js';

function paginate(array, pageQuery, limitQuery) {
  const page = Math.max(1, parseInt(pageQuery || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(limitQuery || '20', 10)));

  const total = array.length;
  const total_pages = Math.ceil(total / limit) || 1;
  const offset = (page - 1) * limit;
  const data = array.slice(offset, offset + limit);

  return {
    data,
    meta: { page, limit, total, total_pages }
  };
}

export async function developerApiV1Routes(fastify, opts) {
  fastify.addHook('onRequest', requireApiKey);

  // Business
  fastify.get('/api/v1/business', async (request, reply) => {
    return {
      success: true,
      data: request.apiAuth.business,
      meta: {}
    };
  });

  // Customers
  fastify.get('/api/v1/customers', async (request, reply) => {
    const list = await CustomerService.getCustomers(request.session);
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  fastify.post('/api/v1/customers', async (request, reply) => {
    const customer = await CustomerService.createCustomer(request.session, request.body || {});
    return { success: true, data: customer, meta: {} };
  });

  fastify.get('/api/v1/customers/:id', async (request, reply) => {
    const customer = await CustomerService.getCustomerById(request.session, request.params.id);
    if (!customer) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    }
    return { success: true, data: customer, meta: {} };
  });

  fastify.put('/api/v1/customers/:id', async (request, reply) => {
    const updated = await CustomerService.updateCustomer(request.session, request.params.id, request.body || {});
    return { success: true, data: updated, meta: {} };
  });

  fastify.delete('/api/v1/customers/:id', async (request, reply) => {
    await CustomerService.deleteCustomer(request.session, request.params.id);
    return { success: true, message: 'Customer deleted', meta: {} };
  });

  // Products
  fastify.get('/api/v1/products', async (request, reply) => {
    const list = await ProductService.getProducts(request.session);
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  fastify.post('/api/v1/products', async (request, reply) => {
    const product = await ProductService.createProduct(request.session, request.body || {});
    return { success: true, data: product, meta: {} };
  });

  fastify.put('/api/v1/products/:id', async (request, reply) => {
    const updated = await ProductService.updateProduct(request.session, request.params.id, request.body || {});
    return { success: true, data: updated, meta: {} };
  });

  fastify.delete('/api/v1/products/:id', async (request, reply) => {
    await ProductService.deleteProduct(request.session, request.params.id);
    return { success: true, message: 'Product deleted', meta: {} };
  });

  // Quotations
  fastify.get('/api/v1/quotations', async (request, reply) => {
    let list = await QuotationService.getQuotations(request.session);
    if (request.query.status) {
      list = list.filter(q => q.status.toLowerCase() === request.query.status.toLowerCase());
    }
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  fastify.post('/api/v1/quotations', async (request, reply) => {
    const quotation = await QuotationService.createQuotation(request.session, request.body || {});
    return { success: true, data: quotation, meta: {} };
  });

  fastify.get('/api/v1/quotations/:id', async (request, reply) => {
    const quotation = await QuotationService.getQuotationById(request.session, request.params.id);
    if (!quotation) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
    }
    return { success: true, data: quotation, meta: {} };
  });

  fastify.put('/api/v1/quotations/:id', async (request, reply) => {
    const { status } = request.body || {};
    const updated = await QuotationService.updateQuotationStatus(request.session, request.params.id, status);
    return { success: true, data: updated, meta: {} };
  });

  // Invoices
  fastify.get('/api/v1/invoices', async (request, reply) => {
    let list = await InvoiceService.getInvoices(request.session);
    if (request.query.status) {
      list = list.filter(i => i.status.toLowerCase() === request.query.status.toLowerCase());
    }
    if (request.query.customer_id) {
      list = list.filter(i => i.customer_id === request.query.customer_id);
    }
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  fastify.post('/api/v1/invoices', async (request, reply) => {
    const invoice = await InvoiceService.createInvoice(request.session, request.body || {});
    return { success: true, data: invoice, meta: {} };
  });

  fastify.get('/api/v1/invoices/:id', async (request, reply) => {
    const invoice = await InvoiceService.getInvoiceById(request.session, request.params.id);
    if (!invoice) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    }
    return { success: true, data: invoice, meta: {} };
  });

  fastify.put('/api/v1/invoices/:id', async (request, reply) => {
    const updated = await InvoiceService.updateInvoice(request.session, request.params.id, request.body || {});
    return { success: true, data: updated, meta: {} };
  });

  // Payments
  fastify.get('/api/v1/payments', async (request, reply) => {
    const list = await PaymentService.getPayments(request.session);
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  fastify.post('/api/v1/payments', async (request, reply) => {
    try {
      const payment = await PaymentService.recordPayment(request.session, request.body || {});
      return { success: true, data: payment, meta: {} };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYMENT', message: err.message } });
    }
  });

  // Expenses
  fastify.get('/api/v1/expenses', async (request, reply) => {
    const list = await ExpenseService.getExpenses(request.session);
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  fastify.post('/api/v1/expenses', async (request, reply) => {
    const expense = await ExpenseService.createExpense(request.session, request.body || {});
    return { success: true, data: expense, meta: {} };
  });

  // Transactions
  fastify.get('/api/v1/transactions', async (request, reply) => {
    const list = await TransactionService.getTransactions(request.session, request.query || {});
    const { data, meta } = paginate(list, request.query.page, request.query.limit);
    return { success: true, data, meta };
  });

  // Reports
  fastify.get('/api/v1/reports/summary', async (request, reply) => {
    const summary = await ReportService.getSummary(request.session);
    return { success: true, data: summary, meta: {} };
  });

  fastify.get('/api/v1/reports/sales', async (request, reply) => {
    const report = await ReportService.getSalesReport(request.session);
    return { success: true, data: report, meta: {} };
  });

  fastify.get('/api/v1/reports/expenses', async (request, reply) => {
    const report = await ReportService.getExpenseReport(request.session);
    return { success: true, data: report, meta: {} };
  });

  fastify.get('/api/v1/reports/profit-loss', async (request, reply) => {
    const report = await ReportService.getProfitLoss(request.session);
    return { success: true, data: report, meta: {} };
  });
}
