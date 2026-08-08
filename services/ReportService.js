import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

export class ReportService {
  static async getSummary(session) {
    const { business, tokens } = session;

    const invoices = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Invoices'))
      .filter(i => i.business_id === business.business_id);

    const quotations = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Quotations'))
      .filter(q => q.business_id === business.business_id);

    const payments = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Payments'))
      .filter(p => p.business_id === business.business_id);

    const expenses = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Expenses'))
      .filter(e => e.business_id === business.business_id);

    const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;

    const outstandingReceivables = invoices.reduce((sum, i) => sum + (parseFloat(i.balance_due) || 0), 0);
    const pendingQuotations = quotations.filter(q => q.status === 'Draft' || q.status === 'Sent').length;
    const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Partially Paid' || i.status === 'Overdue').length;
    const paidInvoices = invoices.filter(i => i.status === 'Paid').length;

    // Monthly revenue chart calculation
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthRevenue = payments
      .filter(p => p.payment_date && p.payment_date.startsWith(currentMonthPrefix))
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    return {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      outstanding_receivables: outstandingReceivables,
      pending_quotations: pendingQuotations,
      unpaid_invoices: unpaidInvoices,
      paid_invoices: paidInvoices,
      this_month_revenue: thisMonthRevenue,
      currency: business.currency || 'USD $'
    };
  }

  static async getSalesReport(session) {
    const { business, tokens } = session;
    const invoices = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Invoices'))
      .filter(i => i.business_id === business.business_id);

    const totalBilled = invoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    const totalPaid = invoices.reduce((sum, i) => sum + (parseFloat(i.paid_amount) || 0), 0);
    const outstanding = invoices.reduce((sum, i) => sum + (parseFloat(i.balance_due) || 0), 0);

    return {
      total_sales: totalBilled,
      total_paid: totalPaid,
      total_outstanding: outstanding,
      invoice_count: invoices.length,
      paid_count: invoices.filter(i => i.status === 'Paid').length,
      unpaid_count: invoices.filter(i => i.status !== 'Paid').length
    };
  }

  static async getExpenseReport(session) {
    const { business, tokens } = session;
    const expenses = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Expenses'))
      .filter(e => e.business_id === business.business_id);

    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const categoryBreakdown = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      const amt = parseFloat(e.amount) || 0;
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amt;
    });

    return {
      total_expenses: totalExpenses,
      category_breakdown: categoryBreakdown,
      expense_count: expenses.length
    };
  }

  static async getProfitLoss(session) {
    const summary = await this.getSummary(session);
    return {
      revenue: summary.total_revenue,
      expenses: summary.total_expenses,
      net_profit: summary.net_profit,
      margin_percentage: summary.total_revenue > 0 ? ((summary.net_profit / summary.total_revenue) * 100).toFixed(2) : '0.00'
    };
  }

  static async getCustomerReport(session) {
    const { business, tokens } = session;
    const customers = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Customers'))
      .filter(c => c.business_id === business.business_id);

    const invoices = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Invoices');

    return customers.map(c => {
      const custInvoices = invoices.filter(i => i.customer_id === c.customer_id);
      const totalSales = custInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
      const totalPaid = custInvoices.reduce((sum, i) => sum + (parseFloat(i.paid_amount) || 0), 0);
      const outstanding = custInvoices.reduce((sum, i) => sum + (parseFloat(i.balance_due) || 0), 0);

      return {
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        company_name: c.company_name,
        total_sales: totalSales,
        total_paid: totalPaid,
        outstanding: outstanding
      };
    });
  }

  static async getTaxReport(session) {
    const { business, tokens } = session;
    const invoices = (await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Invoices'))
      .filter(i => i.business_id === business.business_id);

    const taxableAmount = invoices.reduce((sum, i) => sum + (parseFloat(i.subtotal) || 0), 0);
    const taxCollected = invoices.reduce((sum, i) => sum + (parseFloat(i.tax) || 0), 0);

    return {
      taxable_amount: taxableAmount,
      tax_collected: taxCollected,
      invoice_count: invoices.length
    };
  }
}
