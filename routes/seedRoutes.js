import { requireWebSession } from '../middleware/authMiddleware.js';
import { CustomerService } from '../services/CustomerService.js';
import { ProductService } from '../services/ProductService.js';
import { QuotationService } from '../services/QuotationService.js';
import { InvoiceService } from '../services/InvoiceService.js';
import { PaymentService } from '../services/PaymentService.js';
import { ExpenseService } from '../services/ExpenseService.js';
import { TransactionService } from '../services/TransactionService.js';

export async function seedRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  // 1-Click Feed Sample Data Endpoint
  fastify.post('/api/demo/seed', async (request, reply) => {
    const session = request.session;

    try {
      // 1. Seed Customers
      const cust1 = await CustomerService.createCustomer(session, {
        customer_name: 'Acme Enterprises',
        company_name: 'Acme Corp Inc.',
        email: 'contact@acmecorp.com',
        phone: '+1 (555) 234-5678',
        address: '100 Innovation Way, Suite 400',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        tax_number: 'US-987654321',
        opening_balance: '0'
      });

      const cust2 = await CustomerService.createCustomer(session, {
        customer_name: 'Global Logistics Ltd',
        company_name: 'Global Logistics Solutions',
        email: 'billing@globallogistics.io',
        phone: '+1 (555) 876-5432',
        address: '45 Freight Blvd',
        city: 'Chicago',
        state: 'IL',
        country: 'USA',
        tax_number: 'US-123456789',
        opening_balance: '0'
      });

      const cust3 = await CustomerService.createCustomer(session, {
        customer_name: 'Nexus Tech Systems',
        company_name: 'Nexus Innovations',
        email: 'accounts@nexustech.org',
        phone: '+1 (555) 432-1098',
        address: '88 Cyber Park',
        city: 'Austin',
        state: 'TX',
        country: 'USA',
        tax_number: 'US-456789123',
        opening_balance: '0'
      });

      // 2. Seed Products & Services
      const prod1 = await ProductService.createProduct(session, {
        name: 'Full Stack Web App Development',
        description: 'Custom React & Node.js application engineering',
        type: 'Service',
        sku: 'DEV-WEB-01',
        unit: 'project',
        price: '3500.00',
        tax_rate: '10',
        stock: '0',
        status: 'Active'
      });

      const prod2 = await ProductService.createProduct(session, {
        name: 'Cloud Infrastructure Setup',
        description: 'AWS / Google Cloud architecture & CI/CD deployment',
        type: 'Service',
        sku: 'CLOUD-OPS-02',
        unit: 'hours',
        price: '150.00',
        tax_rate: '10',
        stock: '0',
        status: 'Active'
      });

      const prod3 = await ProductService.createProduct(session, {
        name: 'UI/UX Design Package',
        description: 'Figma wireframes, UI design system, & responsive layouts',
        type: 'Service',
        sku: 'DESIGN-03',
        unit: 'package',
        price: '1200.00',
        tax_rate: '10',
        stock: '0',
        status: 'Active'
      });

      const prod4 = await ProductService.createProduct(session, {
        name: 'Enterprise Software License',
        description: 'Annual SaaS platform user seat license',
        type: 'Product',
        sku: 'SAAS-ENT-04',
        unit: 'license',
        price: '499.00',
        tax_rate: '10',
        stock: '50',
        status: 'Active'
      });

      // 3. Seed Quotations
      const quo1 = await QuotationService.createQuotation(session, {
        customer_id: cust1.customer_id,
        valid_until: '2026-09-30',
        notes: 'Thank you for your business. Quote valid for 30 days.',
        terms: 'Net 30 days payment terms',
        items: [
          { product_id: prod1.product_id, description: prod1.name, quantity: 1, unit_price: 3500, discount: 0, tax_rate: 10 },
          { product_id: prod2.product_id, description: prod2.name, quantity: 5, unit_price: 150, discount: 0, tax_rate: 10 }
        ]
      });

      const quo2 = await QuotationService.createQuotation(session, {
        customer_id: cust2.customer_id,
        valid_until: '2026-10-15',
        notes: 'Special discount applied for long-term partnership.',
        terms: 'Payment due on acceptance',
        items: [
          { product_id: prod3.product_id, description: prod3.name, quantity: 1, unit_price: 1200, discount: 100, tax_rate: 10 }
        ]
      });

      // 4. Seed Invoices
      const inv1 = await InvoiceService.createInvoice(session, {
        customer_id: cust1.customer_id,
        due_date: '2026-09-15',
        notes: 'Payment received with thanks.',
        terms: 'Net 15 days',
        items: [
          { product_id: prod1.product_id, description: prod1.name, quantity: 1, unit_price: 3500, discount: 0, tax_rate: 10 }
        ]
      });

      const inv2 = await InvoiceService.createInvoice(session, {
        customer_id: cust2.customer_id,
        due_date: '2026-09-20',
        notes: 'Partial payment received.',
        terms: 'Net 30 days',
        items: [
          { product_id: prod3.product_id, description: prod3.name, quantity: 2, unit_price: 1200, discount: 0, tax_rate: 10 }
        ]
      });

      const inv3 = await InvoiceService.createInvoice(session, {
        customer_id: cust3.customer_id,
        due_date: '2026-08-15',
        notes: 'Overdue invoice reminder sent.',
        terms: 'Due on Receipt',
        items: [
          { product_id: prod4.product_id, description: prod4.name, quantity: 3, unit_price: 499, discount: 0, tax_rate: 10 }
        ]
      });

      // 5. Seed Payments
      await PaymentService.recordPayment(session, {
        invoice_id: inv1.invoice_id,
        payment_date: '2026-08-05',
        amount: String(inv1.total),
        payment_method: 'Bank Transfer',
        reference_number: 'TRX-98210398',
        notes: 'Paid in full via ACH'
      });

      await PaymentService.recordPayment(session, {
        invoice_id: inv2.invoice_id,
        payment_date: '2026-08-07',
        amount: '1500.00',
        payment_method: 'Credit Card',
        reference_number: 'PAY-4892019',
        notes: 'Initial partial payment deposit'
      });

      // 6. Seed Expenses
      await ExpenseService.createExpense(session, {
        category: 'Software & Cloud',
        description: 'AWS Cloud Server Hosting & Infrastructure',
        amount: '320.00',
        payment_method: 'Credit Card',
        expense_date: '2026-08-01',
        vendor: 'Amazon Web Services',
        reference: 'INV-AWS-89201',
        notes: 'Monthly production hosting'
      });

      await ExpenseService.createExpense(session, {
        category: 'Office & Supplies',
        description: 'High-speed Fiber Internet & Utilities',
        amount: '145.00',
        payment_method: 'Direct Debit',
        expense_date: '2026-08-03',
        vendor: 'Verizon Fiber',
        reference: 'UTIL-98120',
        notes: 'Office monthly internet bill'
      });

      await ExpenseService.createExpense(session, {
        category: 'Marketing & Sales',
        description: 'Google Search Ads Campaign',
        amount: '500.00',
        payment_method: 'Credit Card',
        expense_date: '2026-08-06',
        vendor: 'Google Ads',
        reference: 'ADS-2026-08',
        notes: 'Client acquisition ad campaign'
      });

      return {
        success: true,
        message: 'Successfully seeded complete sample test data into your account and Google Drive Sheet!',
        seeded: {
          customers: 3,
          products: 4,
          quotations: 2,
          invoices: 3,
          payments: 2,
          expenses: 3
        }
      };
    } catch (err) {
      console.error('Failed to seed demo data:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'SEED_ERROR', message: err.message }
      });
    }
  });

  // Fetch Summary Data Count from All Tabs
  fastify.get('/api/demo/data', async (request, reply) => {
    const session = request.session;

    try {
      const customers = await CustomerService.getCustomers(session);
      const products = await ProductService.getProducts(session);
      const quotations = await QuotationService.getQuotations(session);
      const invoices = await InvoiceService.getInvoices(session);
      const expenses = await ExpenseService.getExpenses(session);
      const transactions = await TransactionService.getTransactions(session);

      return {
        success: true,
        spreadsheet_id: session.business.spreadsheet_id,
        spreadsheet_url: session.business.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${session.business.spreadsheet_id}` : null,
        counts: {
          customers: customers.length,
          products: products.length,
          quotations: quotations.length,
          invoices: invoices.length,
          expenses: expenses.length,
          transactions: transactions.length
        },
        sample_data: {
          customers: customers.slice(0, 5),
          products: products.slice(0, 5),
          invoices: invoices.slice(0, 5)
        }
      };
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: { code: 'FETCH_ERROR', message: err.message }
      });
    }
  });
}
