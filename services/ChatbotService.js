import { ReportService } from './ReportService.js';
import { InvoiceService } from './InvoiceService.js';
import { QuotationService } from './QuotationService.js';

export class ChatbotService {
  /**
   * Built-in intelligent business assistant running 100% locally.
   * No third-party AI APIs are used; user data never leaves the server.
   */
  static async askMistral(session, userQuery, messageHistory = []) {
    return this.askAssistant(session, userQuery, messageHistory);
  }

  static async askAssistant(session, userQuery, messageHistory = []) {
    const q = (userQuery || '').toLowerCase().trim();
    const businessName = session?.business?.business_name || 'My Business';
    const currency = session?.business?.currency || '₹';

    let summaryData = null;
    let invoices = [];
    let quotations = [];

    try {
      summaryData = await ReportService.getSummary(session);
      invoices = await InvoiceService.getInvoices(session);
      quotations = await QuotationService.getQuotations(session);
    } catch (err) {
      console.warn('Local assistant context fetch warning:', err.message);
    }

    const unpaidInvoices = (invoices || []).filter(i => i.status !== 'Paid');
    const pendingQuotations = (quotations || []).filter(q => q.status === 'Sent' || q.status === 'Draft');

    // 1. Greeting & Introductions
    if (q === 'hi' || q === 'hello' || q === 'hey' || q.includes('who are you') || q.includes('help me')) {
      return `Hello! I am your **Bizsheet Smart Business Assistant** for **${businessName}**.

I can help you monitor your finances, track outstanding balances, and guide you through billing tasks:
• Ask *"What is my revenue?"* or *"What is my profit?"*
• Ask *"Show unpaid invoices"* or *"Pending quotations"*
• Ask *"How to create an invoice?"* or *"How to get paid with UPI QR?"*
• Ask *"Summary"* for a quick business snapshot!`;
    }

    // 2. Full Business Summary
    if (q.includes('summary') || q.includes('overview') || q.includes('snapshot') || q.includes('dashboard') || q.includes('status')) {
      if (!summaryData) return `No financial records recorded yet for **${businessName}**. Create your first invoice to view live insights!`;
      return `Here is your current live business snapshot for **${businessName}**:

• 💰 **Total Revenue Collected**: ${summaryData.currency} ${summaryData.total_revenue}
• 📉 **Total Expenses**: ${summaryData.currency} ${summaryData.total_expenses}
• 📈 **Net Profit**: ${summaryData.currency} ${summaryData.net_profit}
• ⏳ **Outstanding Receivables**: ${summaryData.currency} ${summaryData.outstanding_receivables}
• 📄 **Unpaid Invoices**: ${summaryData.unpaid_invoices}
• 📑 **Pending Quotations**: ${summaryData.pending_quotations}
• ✅ **Paid Invoices**: ${summaryData.paid_invoices}`;
    }

    // 3. Revenue & Sales
    if (q.includes('revenue') || q.includes('sales') || q.includes('turnover') || q.includes('collection')) {
      const rev = summaryData?.total_revenue || '0.00';
      const paidCount = summaryData?.paid_invoices || 0;
      return `📊 **Revenue Details for ${businessName}**:
• **Total Revenue Collected**: **${currency} ${rev}**
• **Fully Paid Invoices**: ${paidCount}
All transactions are logged directly into your Google Drive *Business Billing Data* ledger.`;
    }

    // 4. Profit & Margins
    if (q.includes('profit') || q.includes('net profit') || q.includes('margin') || q.includes('earnings')) {
      const profit = summaryData?.net_profit || '0.00';
      const rev = summaryData?.total_revenue || '0.00';
      const exp = summaryData?.total_expenses || '0.00';
      return `📈 **Net Profit Breakdown for ${businessName}**:
• **Revenue Collected**: ${currency} ${rev}
• **Total Expenses**: -${currency} ${exp}
• **Net Profit**: **${currency} ${profit}**`;
    }

    // 5. Expenses & Spending
    if (q.includes('expense') || q.includes('spending') || q.includes('cost') || q.includes('vendor')) {
      const exp = summaryData?.total_expenses || '0.00';
      return `📉 **Expense Overview**:
• **Total Expenses Recorded**: **${currency} ${exp}**
You can record new business expenses anytime from the **Expenses** tab to automatically calculate accurate net margins.`;
    }

    // 6. Unpaid Invoices & Receivables
    if (q.includes('unpaid') || q.includes('due') || q.includes('receivable') || q.includes('pending payment') || q.includes('balance')) {
      const outstanding = summaryData?.outstanding_receivables || '0.00';
      if (unpaidInvoices.length === 0) {
        return `🎉 Great news! There are currently **no unpaid invoices**. All outstanding customer balances are settled.`;
      }
      const topUnpaid = unpaidInvoices.slice(0, 5).map(i => 
        `  • **#${i.invoice_number}** — ${i.customer_name || 'Customer'}: **${currency}${i.balance_due || i.total}** due (Status: ${i.status})`
      ).join('\n');

      return `⏳ **Outstanding Receivables: ${currency} ${outstanding}** (${unpaidInvoices.length} unpaid invoices)

${topUnpaid}
${unpaidInvoices.length > 5 ? `\n...and ${unpaidInvoices.length - 5} more in your Invoices tab.` : ''}

You can send payment reminders directly via Gmail from the Invoice details screen!`;
    }

    // 7. Quotations / Estimates
    if (q.includes('quotation') || q.includes('estimate') || q.includes('quote')) {
      const count = pendingQuotations.length;
      return `📑 **Quotations Overview**:
• **Pending / Draft Quotations**: ${count}
You can convert any approved Quotation directly into a Tax Invoice with 1 click from the **Quotations** page.`;
    }

    // 8. How to & Navigation
    if (q.includes('how to create') || q.includes('how to invoice') || q.includes('how to make')) {
      return `📝 **How to Create a Tax Invoice**:
1. Click **Invoices** in the left sidebar.
2. Click **+ New Invoice**.
3. Select an existing customer or create a new one.
4. Add items, quantities, tax rates, and payment terms.
5. Click **Create Invoice**. You can immediately download PDF, print, or email it to your client!`;
    }

    if (q.includes('upi') || q.includes('qr') || q.includes('bank') || q.includes('payment method')) {
      return `💳 **UPI & Bank Payment Settings**:
Go to **Settings** > **Bank & UPI Details** to configure your UPI ID and Bank Account number. 
Bizsheet automatically renders dynamic payment QR codes on all your invoices so customers can scan & pay instantly!`;
    }

    if (q.includes('api') || q.includes('developer') || q.includes('webhook')) {
      return `⚙️ **Developer Tools & Webhooks**:
Bizsheet provides REST APIs and real-time Webhooks for developers:
• Generate secure API keys in the **Developer > API Keys** tab.
• Configure instant event webhooks in the **Developer > Webhooks** tab to receive callbacks on invoice creation and payments.`;
    }

    // Default Fallback
    if (summaryData) {
      return `I found your business records for **${businessName}**:
• **Total Revenue**: ${summaryData.currency} ${summaryData.total_revenue}
• **Net Profit**: ${summaryData.currency} ${summaryData.net_profit}
• **Outstanding Due**: ${summaryData.currency} ${summaryData.outstanding_receivables}

You can ask me specific questions like *"Show unpaid invoices"*, *"What are my expenses?"*, or *"How to create an invoice?"*.`;
    }

    return `I am your **Bizsheet Smart Assistant**. How can I help you manage your billing, quotations, or business reports today?`;
  }
}
