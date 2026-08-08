import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

export class CustomerService {
  static async getCustomers(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return [];

    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Customers');
    if (!Array.isArray(rows)) return [];
    
    return rows.filter(r => r && (r.business_id === business.business_id || !r.business_id));
  }

  static async getCustomerById(session, customerId) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return null;

    const customers = await this.getCustomers(session);
    const customer = customers.find(c => c && c.customer_id === customerId);

    if (!customer) return null;

    const rawInvoices = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Invoices');
    const invoices = (Array.isArray(rawInvoices) ? rawInvoices : [])
      .filter(i => i && i.business_id === business.business_id && i.customer_id === customerId);
    
    const rawQuotations = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Quotations');
    const quotations = (Array.isArray(rawQuotations) ? rawQuotations : [])
      .filter(q => q && q.business_id === business.business_id && q.customer_id === customerId);

    const rawPayments = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Payments');
    const payments = (Array.isArray(rawPayments) ? rawPayments : [])
      .filter(p => p && p.business_id === business.business_id && p.customer_id === customerId);

    const rawTransactions = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Transactions');
    const transactions = (Array.isArray(rawTransactions) ? rawTransactions : [])
      .filter(t => t && t.business_id === business.business_id && t.customer_id === customerId);

    const totalSales = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const openingBalance = parseFloat(customer.opening_balance) || 0;
    const outstanding = totalSales + openingBalance - totalPaid;

    return {
      ...customer,
      summary: {
        total_sales: totalSales,
        total_paid: totalPaid,
        outstanding: Math.max(0, outstanding),
        quotations_count: quotations.length,
        invoices_count: invoices.length,
        payments_count: payments.length
      },
      invoices,
      quotations,
      payments,
      transactions
    };
  }

  static async createCustomer(session, customerData) {
    const { business, tokens } = session;
    const customerId = `cus_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    const record = {
      customer_id: customerId,
      business_id: business ? business.business_id : '',
      customer_name: customerData.customer_name || '',
      company_name: customerData.company_name || '',
      email: customerData.email || '',
      phone: customerData.phone || '',
      address: customerData.address || '',
      city: customerData.city || '',
      state: customerData.state || '',
      country: customerData.country || '',
      tax_number: customerData.tax_number || '',
      opening_balance: customerData.opening_balance || '0',
      notes: customerData.notes || '',
      created_at: now,
      updated_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business ? business.spreadsheet_id : '', 'Customers', record);
    return record;
  }

  static async updateCustomer(session, customerId, customerData) {
    const { business, tokens } = session;
    return GoogleSheetsRepository.updateRow(
      tokens,
      business ? business.spreadsheet_id : '',
      'Customers',
      'customer_id',
      customerId,
      customerData
    );
  }

  static async deleteCustomer(session, customerId) {
    const { business, tokens } = session;
    return GoogleSheetsRepository.deleteRow(
      tokens,
      business ? business.spreadsheet_id : '',
      'Customers',
      'customer_id',
      customerId
    );
  }
}
