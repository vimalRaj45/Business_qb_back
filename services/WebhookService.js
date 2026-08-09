import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

export class WebhookService {
  static async getWebhooks(session) {
    const { business, tokens } = session;
    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Webhooks');
    return rows.filter(w => w.business_id === business.business_id);
  }

  static async getWebhookLogs(session) {
    const { business, tokens } = session;
    const logs = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'WebhookLogs');
    return logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  static async createWebhook(session, url, events = []) {
    const { business, tokens } = session;
    const webhookId = `wh_${crypto.randomBytes(6).toString('hex')}`;
    const secret = `whsec_${crypto.randomBytes(18).toString('hex')}`;
    const now = new Date().toISOString();

    const record = {
      webhook_id: webhookId,
      business_id: business.business_id,
      url,
      secret,
      events: JSON.stringify(events.length ? events : ['*']),
      status: 'Active',
      created_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id, 'Webhooks', record);
    return record;
  }

  static async deleteWebhook(session, webhookId) {
    const { business, tokens } = session;
    return GoogleSheetsRepository.deleteRow(
      tokens,
      business.spreadsheet_id,
      'Webhooks',
      'webhook_id',
      webhookId
    );
  }

  /**
   * Triggers event and dispatches HTTP POST requests to matching active webhooks with HMAC signatures
   */
  static async triggerEvent(session, eventName, payload) {
    const webhooks = await this.getWebhooks(session).catch(() => []);
    if (!Array.isArray(webhooks) || !webhooks.length) return;

    const activeWebhooks = webhooks.filter(w => {
      if (w.status !== 'Active') return false;
      try {
        const eventsArr = JSON.parse(w.events);
        return eventsArr.includes('*') || eventsArr.includes(eventName);
      } catch {
        return true;
      }
    });

    const bodyString = JSON.stringify({
      event: eventName,
      timestamp: new Date().toISOString(),
      data: payload
    });

    for (const hook of activeWebhooks) {
      // Calculate HMAC signature
      const signature = crypto.createHmac('sha256', hook.secret || 'secret').update(bodyString).digest('hex');

      let statusCode = 200;
      let responseText = 'OK';

      try {
        if (hook.url && hook.url.startsWith('http')) {
          const res = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-BizSheet-Signature': signature,
              'X-BizSheet-Event': eventName
            },
            body: bodyString,
            signal: AbortSignal.timeout(5000)
          });
          statusCode = res.status;
          responseText = await res.text().catch(() => '');
        }
      } catch (err) {
        statusCode = 500;
        responseText = err.message || 'Fetch failed';
      }

      // Log attempt
      const logRecord = {
        log_id: `whlog_${crypto.randomBytes(6).toString('hex')}`,
        webhook_id: hook.webhook_id,
        event: eventName,
        payload: bodyString.substring(0, 500),
        status_code: String(statusCode),
        response: String(responseText).substring(0, 200),
        attempt: '1',
        created_at: new Date().toISOString()
      };

      GoogleSheetsRepository.appendRow(session.tokens, session.business.spreadsheet_id, 'WebhookLogs', logRecord).catch(() => {});
    }
  }

  static async triggerWebhooks(session, eventName, payload) {
    return this.triggerEvent(session, eventName, payload);
  }

  static async triggerWebhook(session, eventName, payload) {
    return this.triggerEvent(session, eventName, payload);
  }
}
