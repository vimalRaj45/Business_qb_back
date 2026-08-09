import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { InvoiceService } from './InvoiceService.js';
import { AuditLogService } from './AuditLogService.js';

export class QuotationService {
  static async getQuotations(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return [];

    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Quotations');
    if (!Array.isArray(rows)) return [];

    const quotations = rows.filter(r => r && r.business_id === business.business_id);
    const customers = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Customers');
    const customerMap = new Map((Array.isArray(customers) ? customers : []).map(c => [c.customer_id, c.customer_name]));

    return quotations.map(q => ({
      ...q,
      customer_name: customerMap.get(q.customer_id) || q.customer_name || 'Customer'
    }));
  }

  static async getQuotationById(session, quotationId) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return null;

    const quotations = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Quotations');
    const quotation = (Array.isArray(quotations) ? quotations : []).find(q => q && q.quotation_id === quotationId && q.business_id === business.business_id);
    if (!quotation) return null;

    const rawItems = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'QuotationItems');
    const items = (Array.isArray(rawItems) ? rawItems : []).filter(item => item && item.quotation_id === quotationId);

    const customers = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Customers');
    const customer = (Array.isArray(customers) ? customers : []).find(c => c && c.customer_id === quotation.customer_id) || null;

    const custName = customer ? customer.customer_name : (quotation.customer_name || 'Customer');
    const custCompany = customer ? customer.company_name : (quotation.customer_company || '');
    const custAddress = customer ? [customer.address, customer.city, customer.state, customer.country].filter(Boolean).join(', ') : (quotation.customer_address || '');
    const custTaxNumber = customer ? customer.tax_number : (quotation.customer_tax_number || '');

    return {
      ...quotation,
      business,
      customer_name: custName,
      customer_company: custCompany,
      customer_address: custAddress,
      customer_tax_number: custTaxNumber,
      customer,
      items
    };
  }

  static async createQuotation(session, quotationData) {
    const { business, tokens } = session;
    const existing = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Quotations');
    const count = (Array.isArray(existing) ? existing : []).filter(r => r && r.business_id === business.business_id).length + 1;
    const prefix = business.quotation_prefix || 'QUO-';
    const quotationNumber = quotationData.quotation_number || `${prefix}${String(count).padStart(5, '0')}`;

    const quotationId = `quo_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    let subtotal = 0;
    let totalTax = 0;
    const processedItems = [];

    if (Array.isArray(quotationData.items)) {
      for (const item of quotationData.items) {
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
          quotation_item_id: `quo_item_${crypto.randomBytes(6).toString('hex')}`,
          quotation_id: quotationId,
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

    const overallDiscount = parseFloat(quotationData.discount) || 0;
    const grandTotal = subtotal + totalTax - overallDiscount;

    const quotationRecord = {
      quotation_id: quotationId,
      business_id: business.business_id,
      quotation_number: quotationNumber,
      customer_id: quotationData.customer_id || '',
      quotation_date: quotationData.quotation_date || now.split('T')[0],
      valid_until: quotationData.valid_until || now.split('T')[0],
      subtotal: String(subtotal.toFixed(2)),
      discount: String(overallDiscount.toFixed(2)),
      tax: String(totalTax.toFixed(2)),
      total: String(grandTotal.toFixed(2)),
      status: quotationData.status || 'Draft',
      notes: quotationData.notes || '',
      terms: quotationData.terms || 'This quotation is valid until the specified date above.',
      created_at: now,
      updated_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id || '', 'Quotations', quotationRecord);

    for (const item of processedItems) {
      await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id || '', 'QuotationItems', item);
    }

    await AuditLogService.logActivity(session, {
      action: 'CREATE',
      resource_type: 'Quotation',
      resource_id: quotationId,
      description: `Created Quotation #${quotationNumber} (${business.currency || '$'}${grandTotal.toFixed(2)})`
    });

    return quotationRecord;
  }

  static async convertToInvoice(session, quotationId) {
    const quotation = await this.getQuotationById(session, quotationId);
    if (!quotation) throw new Error('Quotation not found');

    const invoicePayload = {
      quotation_id: quotation.quotation_id,
      customer_id: quotation.customer_id,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: quotation.valid_until || new Date().toISOString().split('T')[0],
      discount: quotation.discount,
      notes: quotation.notes,
      terms: quotation.terms,
      items: quotation.items
    };

    const invoice = await InvoiceService.createInvoice(session, invoicePayload);

    await GoogleSheetsRepository.updateRow(
      session.tokens,
      session.business.spreadsheet_id || '',
      'Quotations',
      'quotation_id',
      quotationId,
      { status: 'Converted' }
    );

    await AuditLogService.logActivity(session, {
      action: 'UPDATE',
      resource_type: 'Quotation',
      resource_id: quotationId,
      description: `Converted Quotation #${quotation.quotation_number} to Invoice`
    });

    return invoice;
  }

  static async deleteQuotation(session, quotationId) {
    const { business, tokens } = session;
    const deleted = await GoogleSheetsRepository.deleteRow(
      tokens,
      business.spreadsheet_id || '',
      'Quotations',
      'quotation_id',
      quotationId
    );

    await AuditLogService.logActivity(session, {
      action: 'DELETE',
      resource_type: 'Quotation',
      resource_id: quotationId,
      description: `Deleted quotation record`
    });

    return deleted;
  }
}
