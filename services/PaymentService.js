import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { InvoiceService } from './InvoiceService.js';
import { WebhookService } from './WebhookService.js';

export class PaymentService {
  static async getPayments(session) {
    const { business, tokens } = session;
    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Payments');
    const payments = rows.filter(r => r.business_id === business.business_id);

    const customers = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Customers');
    const customerMap = new Map(customers.map(c => [c.customer_id, c.customer_name]));

    const invoices = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Invoices');
    const invoiceMap = new Map(invoices.map(i => [i.invoice_id, i.invoice_number]));

    return payments.map(p => ({
      ...p,
      customer_name: customerMap.get(p.customer_id) || 'Unknown Customer',
      invoice_number: invoiceMap.get(p.invoice_id) || 'N/A'
    }));
  }

  static async recordPayment(session, paymentData) {
    const { business, tokens } = session;
    const invoiceId = paymentData.invoice_id;
    const amount = parseFloat(paymentData.amount) || 0;

    if (amount <= 0) throw new Error('Payment amount must be greater than zero');

    const invoice = await InvoiceService.getInvoiceById(session, invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const prevPaid = parseFloat(invoice.paid_amount) || 0;
    const total = parseFloat(invoice.total) || 0;

    const newPaidAmount = prevPaid + amount;
    const newBalanceDue = Math.max(0, total - newPaidAmount);

    let newStatus = 'Unpaid';
    if (newPaidAmount >= total && total > 0) {
      newStatus = 'Paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'Partially Paid';
    }

    // 1. Update Invoice
    await InvoiceService.updateInvoice(session, invoiceId, {
      paid_amount: String(newPaidAmount.toFixed(2)),
      balance_due: String(newBalanceDue.toFixed(2)),
      status: newStatus,
      updated_at: new Date().toISOString()
    });

    // 2. Create Payment Record
    const paymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    const paymentRecord = {
      payment_id: paymentId,
      business_id: business.business_id,
      invoice_id: invoiceId,
      customer_id: invoice.customer_id,
      payment_date: paymentData.payment_date || now.split('T')[0],
      amount: String(amount.toFixed(2)),
      payment_method: paymentData.payment_method || 'Bank Transfer', // Cash, UPI, Bank Transfer, Card, Cheque, Other
      reference_number: paymentData.reference_number || '',
      notes: paymentData.notes || '',
      created_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id, 'Payments', paymentRecord);

    // 3. Create Transaction Ledger Entry (Income)
    const transactionId = `txn_${crypto.randomBytes(6).toString('hex')}`;
    const allTransactions = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Transactions');
    const prevBalance = allTransactions.reduce((acc, t) => {
      const inc = parseFloat(t.income) || 0;
      const exp = parseFloat(t.expense) || 0;
      return acc + inc - exp;
    }, 0);
    const newBalance = prevBalance + amount;

    const transactionRecord = {
      transaction_id: transactionId,
      business_id: business.business_id,
      transaction_date: paymentRecord.payment_date,
      transaction_type: 'Income',
      reference_type: 'Payment',
      reference_id: paymentId,
      customer_id: invoice.customer_id,
      description: `Payment received for Invoice ${invoice.invoice_number}`,
      income: String(amount.toFixed(2)),
      expense: '0.00',
      balance: String(newBalance.toFixed(2)),
      payment_method: paymentRecord.payment_method,
      created_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id, 'Transactions', transactionRecord);

    // 4. Trigger Webhook
    WebhookService.triggerEvent(session, 'payment.created', paymentRecord).catch(() => {});
    if (newStatus === 'Paid') {
      WebhookService.triggerEvent(session, 'invoice.paid', { ...invoice, status: 'Paid' }).catch(() => {});
    }

    return paymentRecord;
  }
}
