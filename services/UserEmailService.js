import { getOAuth2Client } from '../config/google.js';
import { google } from 'googleapis';
import { QuotationService } from './QuotationService.js';
import { InvoiceService } from './InvoiceService.js';
import { AuditLogService } from './AuditLogService.js';

export class UserEmailService {
  /**
   * Helper to send MIME HTML email directly from user's connected Gmail account
   */
  static async sendGmailMessage(tokens, { to, subject, htmlBody, fromName }) {
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      throw new Error('Google OAuth authorization token required to send email via your Gmail account.');
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: "${fromName || 'Business'}" <me>`,
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      htmlBody
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    return res.data;
  }

  /**
   * Send Quotation email directly via user's Gmail
   */
  static async sendQuotationEmail(session, quotationId, recipientEmail) {
    const quotation = await QuotationService.getQuotationById(session, quotationId);
    if (!quotation) throw new Error('Quotation not found');

    const business = session.business || {};
    const user = session.user || {};
    const to = recipientEmail || quotation.customer?.email || quotation.email;

    if (!to) throw new Error('Recipient customer email address is required.');

    const subject = `Quotation ${quotation.quotation_number} from ${business.business_name || 'My Business'}`;
    const itemsListHtml = (quotation.items || []).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${item.description || 'Item'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${business.currency || '$'}${item.unit_price}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${business.currency || '$'}${item.amount}</td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #0d9488; margin: 0;">${business.business_name || 'Business Quotation'}</h2>
          <p style="font-size: 12px; color: #64748b; margin: 4px 0 0 0;">${business.email || user.email || ''} | ${business.phone || ''}</p>
        </div>

        <h3 style="margin-top: 0;">Quotation #${quotation.quotation_number}</h3>
        <p>Dear <strong>${quotation.customer_name || 'Customer'}</strong>,</p>
        <p>Thank you for reaching out to us. Please find below the details of your requested quotation:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; text-align: left; color: #475569;">
              <th style="padding: 8px;">Description</th>
              <th style="padding: 8px; text-align: center;">Qty</th>
              <th style="padding: 8px; text-align: right;">Price</th>
              <th style="padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsListHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 16px; font-size: 14px;">
          <p style="margin: 4px 0;">Subtotal: <strong>${business.currency || '$'}${quotation.subtotal}</strong></p>
          <p style="margin: 4px 0;">Tax: <strong>${business.currency || '$'}${quotation.tax}</strong></p>
          <h3 style="color: #0d9488; margin: 8px 0 0 0;">Grand Total: ${business.currency || '$'}${quotation.total}</h3>
        </div>

        ${quotation.terms ? `<div style="margin-top: 20px; font-size: 11px; color: #64748b; background: #f8fafc; padding: 12px; border-radius: 8px;"><strong>Terms & Conditions:</strong><br/>${quotation.terms}</div>` : ''}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Sent directly via ${business.business_name || 'Business'} Billing Platform
        </div>
      </div>
    `;

    const result = await this.sendGmailMessage(session.tokens, {
      to,
      subject,
      htmlBody,
      fromName: business.business_name || user.name
    });

    // Update Quotation Status to Sent if Draft
    if (quotation.status === 'Draft') {
      await QuotationService.updateQuotation(session, quotationId, { status: 'Sent' }).catch(() => {});
    }

    // Log Activity for Audit Trail
    await AuditLogService.logActivity(session, {
      action: 'SEND_EMAIL',
      resource_type: 'Quotation',
      resource_id: quotationId,
      description: `Sent Quotation #${quotation.quotation_number} via Gmail to ${to}`
    });

    return { success: true, message: `Quotation sent via your Gmail to ${to}`, data: result };
  }

  /**
   * Send Invoice email directly via user's Gmail
   */
  static async sendInvoiceEmail(session, invoiceId, recipientEmail) {
    const invoice = await InvoiceService.getInvoiceById(session, invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const business = session.business || {};
    const user = session.user || {};
    const to = recipientEmail || invoice.customer?.email || invoice.email;

    if (!to) throw new Error('Recipient customer email address is required.');

    const subject = `Invoice ${invoice.invoice_number} from ${business.business_name || 'My Business'}`;
    const itemsListHtml = (invoice.items || []).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${item.description || 'Item'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${business.currency || '$'}${item.unit_price}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${business.currency || '$'}${item.amount}</td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #0d9488; margin: 0;">${business.business_name || 'Business Invoice'}</h2>
          <p style="font-size: 12px; color: #64748b; margin: 4px 0 0 0;">${business.email || user.email || ''} | ${business.phone || ''}</p>
        </div>

        <h3 style="margin-top: 0;">Invoice #${invoice.invoice_number}</h3>
        <p>Dear <strong>${invoice.customer_name || 'Customer'}</strong>,</p>
        <p>Please find below your invoice details. Payment is due on <strong>${invoice.due_date || 'Due Date'}</strong>.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; text-align: left; color: #475569;">
              <th style="padding: 8px;">Description</th>
              <th style="padding: 8px; text-align: center;">Qty</th>
              <th style="padding: 8px; text-align: right;">Price</th>
              <th style="padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsListHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 16px; font-size: 14px;">
          <p style="margin: 4px 0;">Subtotal: <strong>${business.currency || '$'}${invoice.subtotal}</strong></p>
          <p style="margin: 4px 0;">Paid Amount: <strong style="color: #10b981;">${business.currency || '$'}${invoice.paid_amount || '0.00'}</strong></p>
          <h3 style="color: #0d9488; margin: 8px 0 0 0;">Balance Due: ${business.currency || '$'}${invoice.balance_due || invoice.total}</h3>
        </div>

        ${invoice.terms ? `<div style="margin-top: 20px; font-size: 11px; color: #64748b; background: #f8fafc; padding: 12px; border-radius: 8px;"><strong>Terms & Payment Instructions:</strong><br/>${invoice.terms}</div>` : ''}

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Sent directly via ${business.business_name || 'Business'} Billing Platform
        </div>
      </div>
    `;

    const result = await this.sendGmailMessage(session.tokens, {
      to,
      subject,
      htmlBody,
      fromName: business.business_name || user.name
    });

    // Log Activity for Audit Trail
    await AuditLogService.logActivity(session, {
      action: 'SEND_EMAIL',
      resource_type: 'Invoice',
      resource_id: invoiceId,
      description: `Sent Invoice #${invoice.invoice_number} via Gmail to ${to}`
    });

    return { success: true, message: `Invoice sent via your Gmail to ${to}`, data: result };
  }
}
