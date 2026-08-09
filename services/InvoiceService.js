import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { AuditLogService } from './AuditLogService.js';

export class InvoiceService {
  static async getInvoices(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return [];

    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Invoices');
    if (!Array.isArray(rows)) return [];

    const invoices = rows.filter(r => r && r.business_id === business.business_id);
    const customers = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Customers');
    const customerMap = new Map((Array.isArray(customers) ? customers : []).map(c => [c.customer_id, c.customer_name]));

    return invoices.map(inv => ({
      ...inv,
      customer_name: customerMap.get(inv.customer_id) || inv.customer_name || 'Customer'
    }));
  }

  static async getInvoiceById(session, invoiceId) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return null;

    const invoices = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Invoices');
    const invoice = (Array.isArray(invoices) ? invoices : []).find(inv => inv && inv.invoice_id === invoiceId && inv.business_id === business.business_id);
    if (!invoice) return null;

    const rawItems = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'InvoiceItems');
    const items = (Array.isArray(rawItems) ? rawItems : []).filter(item => item && item.invoice_id === invoiceId);

    const rawPayments = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Payments');
    const payments = (Array.isArray(rawPayments) ? rawPayments : []).filter(p => p && p.invoice_id === invoiceId);

    const customers = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Customers');
    const customer = (Array.isArray(customers) ? customers : []).find(c => c && c.customer_id === invoice.customer_id) || null;

    const custName = customer ? customer.customer_name : (invoice.customer_name || 'Customer');
    const custCompany = customer ? customer.company_name : (invoice.customer_company || '');
    const custAddress = customer ? [customer.address, customer.city, customer.state, customer.country].filter(Boolean).join(', ') : (invoice.customer_address || '');
    const custTaxNumber = customer ? customer.tax_number : (invoice.customer_tax_number || '');

    return {
      ...invoice,
      business,
      customer_name: custName,
      customer_company: custCompany,
      customer_address: custAddress,
      customer_tax_number: custTaxNumber,
      customer,
      items,
      payments
    };
  }

  static async createInvoice(session, invoiceData) {
    const { business, tokens } = session;
    const existing = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Invoices');
    const count = (Array.isArray(existing) ? existing : []).filter(r => r && r.business_id === business.business_id).length + 1;
    const prefix = business.invoice_prefix || 'INV-';
    const invoiceNumber = invoiceData.invoice_number || `${prefix}${String(count).padStart(5, '0')}`;

    const invoiceId = `inv_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    let subtotal = 0;
    let totalTax = 0;
    const processedItems = [];

    if (Array.isArray(invoiceData.items)) {
      for (const item of invoiceData.items) {
        const qty = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const itemDiscount = parseFloat(item.discount) || 0;
        const taxRate = parseFloat(item.tax_rate) || 0;

        const lineSubtotal = (qty * unitPrice) - itemDiscount;
        const lineTax = lineSubtotal * (taxRate / 100);
        const lineTotal = lineSubtotal + lineTax;

        subtotal += lineSubtotal;
        totalTax += lineTax;

        processedItems.push({
          invoice_item_id: `inv_item_${crypto.randomBytes(6).toString('hex')}`,
          invoice_id: invoiceId,
          product_id: item.product_id || '',
          description: item.description || 'Service/Product Item',
          quantity: String(qty),
          unit_price: String(unitPrice),
          discount: String(itemDiscount),
          tax_rate: String(taxRate),
          amount: String(lineTotal.toFixed(2))
        });
      }
    }

    const overallDiscount = parseFloat(invoiceData.discount) || 0;
    const grandTotal = subtotal + totalTax - overallDiscount;

    const invoiceRecord = {
      invoice_id: invoiceId,
      business_id: business.business_id,
      invoice_number: invoiceNumber,
      quotation_id: invoiceData.quotation_id || '',
      customer_id: invoiceData.customer_id || '',
      invoice_date: invoiceData.invoice_date || now.split('T')[0],
      due_date: invoiceData.due_date || now.split('T')[0],
      subtotal: String(subtotal.toFixed(2)),
      discount: String(overallDiscount.toFixed(2)),
      tax: String(totalTax.toFixed(2)),
      total: String(grandTotal.toFixed(2)),
      paid_amount: '0.00',
      balance_due: String(grandTotal.toFixed(2)),
      status: 'Unpaid',
      notes: invoiceData.notes || '',
      terms: invoiceData.terms || 'Payment due on specified date.',
      created_at: now,
      updated_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id || '', 'Invoices', invoiceRecord);

    for (const item of processedItems) {
      await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id || '', 'InvoiceItems', item);
    }

    await AuditLogService.logActivity(session, {
      action: 'CREATE',
      resource_type: 'Invoice',
      resource_id: invoiceId,
      description: `Created Invoice #${invoiceNumber} (${business.currency || '$'}${grandTotal.toFixed(2)})`
    });

    return invoiceRecord;
  }

  static async updateInvoice(session, invoiceId, invoiceData) {
    const { business, tokens } = session;
    const updated = await GoogleSheetsRepository.updateRow(
      tokens,
      business.spreadsheet_id || '',
      'Invoices',
      'invoice_id',
      invoiceId,
      invoiceData
    );

    await AuditLogService.logActivity(session, {
      action: 'UPDATE',
      resource_type: 'Invoice',
      resource_id: invoiceId,
      description: `Updated invoice details`
    });

    return updated;
  }

  static async deleteInvoice(session, invoiceId) {
    const { business, tokens } = session;
    const deleted = await GoogleSheetsRepository.deleteRow(
      tokens,
      business.spreadsheet_id || '',
      'Invoices',
      'invoice_id',
      invoiceId
    );

    await AuditLogService.logActivity(session, {
      action: 'DELETE',
      resource_type: 'Invoice',
      resource_id: invoiceId,
      description: `Deleted invoice record`
    });

    return deleted;
  }
}
