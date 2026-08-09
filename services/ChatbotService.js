import { env } from '../config/env.js';
import { ReportService } from './ReportService.js';
import { InvoiceService } from './InvoiceService.js';

export class ChatbotService {
  static async askMistral(session, userQuery, messageHistory = []) {
    const apiKey = env.MISTRAL_API_KEY;

    // Fetch live business context to feed to Mistral AI or fallback assistant
    let summaryData = null;
    let summaryText = 'No financial data recorded yet.';
    try {
      summaryData = await ReportService.getSummary(session);
      const invoices = await InvoiceService.getInvoices(session);
      const unpaidInvoices = invoices.filter(i => i.status !== 'Paid');

      summaryText = `
Business Name: ${session.business.business_name || 'My Business'}
Business Type: ${session.business.business_type || 'General'}
Currency: ${session.business.currency || 'INR ₹'}
Financial Summary Snapshot:
- Total Revenue Collected: ${summaryData.currency} ${summaryData.total_revenue}
- Total Expenses: ${summaryData.currency} ${summaryData.total_expenses}
- Net Profit: ${summaryData.currency} ${summaryData.net_profit}
- Outstanding Receivables: ${summaryData.currency} ${summaryData.outstanding_receivables}
- Unpaid Invoices Count: ${summaryData.unpaid_invoices}
- Pending Quotations Count: ${summaryData.pending_quotations}
- Paid Invoices Count: ${summaryData.paid_invoices}

Unpaid Invoices Breakdown:
${unpaidInvoices.map(i => `  • Invoice #${i.invoice_number} for customer ${i.customer_name}: Total ${summaryData.currency} ${i.total}, Balance Due ${summaryData.currency} ${i.balance_due}, Status: ${i.status}`).join('\n') || '  None'}
      `;
    } catch (err) {
      console.warn('Chatbot context fetch warning:', err.message);
    }

    if (!apiKey) {
      const q = userQuery.toLowerCase();
      if (summaryData && (q.includes('revenue') || q.includes('sales') || q.includes('profit') || q.includes('expense') || q.includes('summary') || q.includes('invoice'))) {
        return `Here is your current live business snapshot for **${session.business.business_name || 'My Business'}**:
• **Total Revenue Collected**: ${summaryData.currency} ${summaryData.total_revenue}
• **Total Expenses**: ${summaryData.currency} ${summaryData.total_expenses}
• **Net Profit**: ${summaryData.currency} ${summaryData.net_profit}
• **Outstanding Receivables**: ${summaryData.currency} ${summaryData.outstanding_receivables}
• **Unpaid Invoices**: ${summaryData.unpaid_invoices}
• **Pending Quotations**: ${summaryData.pending_quotations}`;
      }
      return `Hello! I am your AI Business Assistant for **${session.business.business_name || 'My Business'}**.
I can help you analyze your revenue, track quotations, manage invoices, record expenses, and organize your Google Drive ledger!`;
    }

    const systemPrompt = `You are "BizSheet AI", an intelligent business management assistant built into the BizSheet Billing & Quotation Platform.
Your job is to assist business owners with their billing, quotations, invoices, payments, expenses, financial analysis, developer APIs, and platform navigation.

Core Product Philosophy:
- "YOUR BUSINESS DATA. YOUR GOOGLE ACCOUNT. YOUR CONTROL."
- Business records are stored directly inside the owner's Google Drive Spreadsheet ("Business Billing Data").

Live Business Context:
${summaryText}

Instructions:
1. Use the live business financial snapshot above to answer questions about their revenue, net profit, unpaid invoices, or expenses with exact numbers whenever relevant.
2. Be helpful, concise, professional, and friendly.
3. If asked how to use the app, explain clearly (e.g. how to convert quotations to invoices, record partial payments, or generate developer API keys).
4. Use clean markdown formatting (bullet points, bold text).`;

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messageHistory.slice(-6).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      })),
      { role: 'user', content: userQuery }
    ];

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 600
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }

      return data.choices?.[0]?.message?.content || 'I apologize, I could not process your request at this time.';
    } catch (err) {
      if (summaryData) {
        return `Here is your current live business snapshot for **${session.business.business_name || 'My Business'}**:
• **Total Revenue Collected**: ${summaryData.currency} ${summaryData.total_revenue}
• **Total Expenses**: ${summaryData.currency} ${summaryData.total_expenses}
• **Net Profit**: ${summaryData.currency} ${summaryData.net_profit}
• **Outstanding Receivables**: ${summaryData.currency} ${summaryData.outstanding_receivables}`;
      }
      return 'I am currently assisting you in Offline Mode. How can I help you navigate your invoices or reports today?';
    }
  }
}
