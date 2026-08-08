import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { WebhookService } from './WebhookService.js';

export class ExpenseService {
  static async getExpenses(session) {
    const { business, tokens } = session;
    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Expenses');
    return rows.filter(r => r.business_id === business.business_id);
  }

  static async createExpense(session, expenseData) {
    const { business, tokens } = session;
    const expenseId = `exp_${crypto.randomBytes(6).toString('hex')}`;
    const amount = parseFloat(expenseData.amount) || 0;
    const now = new Date().toISOString();

    const record = {
      expense_id: expenseId,
      business_id: business.business_id,
      category: expenseData.category || 'Other', // Rent, Salary, Electricity, Internet, Transport, Marketing, Software, Purchase, Office Supplies, Other
      description: expenseData.description || '',
      amount: String(amount.toFixed(2)),
      payment_method: expenseData.payment_method || 'Bank Transfer',
      expense_date: expenseData.expense_date || now.split('T')[0],
      vendor: expenseData.vendor || '',
      reference: expenseData.reference || '',
      notes: expenseData.notes || '',
      created_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id, 'Expenses', record);

    // Create Transaction Ledger Entry (Expense)
    const transactionId = `txn_${crypto.randomBytes(6).toString('hex')}`;
    const allTransactions = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Transactions');
    const prevBalance = allTransactions.reduce((acc, t) => {
      const inc = parseFloat(t.income) || 0;
      const exp = parseFloat(t.expense) || 0;
      return acc + inc - exp;
    }, 0);
    const newBalance = prevBalance - amount;

    const transactionRecord = {
      transaction_id: transactionId,
      business_id: business.business_id,
      transaction_date: record.expense_date,
      transaction_type: 'Expense',
      reference_type: 'Expense',
      reference_id: expenseId,
      customer_id: '',
      description: `Expense: ${record.category} - ${record.description}`,
      income: '0.00',
      expense: String(amount.toFixed(2)),
      balance: String(newBalance.toFixed(2)),
      payment_method: record.payment_method,
      created_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id, 'Transactions', transactionRecord);

    WebhookService.triggerEvent(session, 'expense.created', record).catch(() => {});

    return record;
  }
}
