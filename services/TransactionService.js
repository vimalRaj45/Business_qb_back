import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

export class TransactionService {
  static async getTransactions(session, query = {}) {
    const { business, tokens } = session;
    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Transactions');
    let transactions = rows.filter(r => r.business_id === business.business_id);

    const customers = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Customers');
    const customerMap = new Map(customers.map(c => [c.customer_id, c.customer_name]));

    // Apply filtering
    if (query.type) {
      transactions = transactions.filter(t => t.transaction_type.toLowerCase() === query.type.toLowerCase());
    }

    if (query.customer_id) {
      transactions = transactions.filter(t => t.customer_id === query.customer_id);
    }

    if (query.from) {
      transactions = transactions.filter(t => t.transaction_date >= query.from);
    }

    if (query.to) {
      transactions = transactions.filter(t => t.transaction_date <= query.to);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      transactions = transactions.filter(t =>
        (t.description && t.description.toLowerCase().includes(searchLower)) ||
        (t.payment_method && t.payment_method.toLowerCase().includes(searchLower))
      );
    }

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.created_at || b.transaction_date) - new Date(a.created_at || a.transaction_date));

    return transactions.map(t => ({
      ...t,
      customer_name: customerMap.get(t.customer_id) || 'N/A'
    }));
  }
}
