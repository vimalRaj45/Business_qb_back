import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

export class AuditLogService {
  /**
   * Log an activity for traceability
   */
  static async logActivity(session, { action, resource_type, resource_id = '', description = '' }) {
    try {
      if (!session || !session.business || !session.business.business_id) return null;

      const { business, user, tokens } = session;
      const logId = `log_${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();

      const logRecord = {
        log_id: logId,
        business_id: business.business_id,
        user_google_id: user?.googleId || 'system',
        user_name: user?.name || 'User',
        user_email: user?.email || '',
        user_role: session.role || (business.owner_google_id === user?.googleId ? 'owner' : 'member'),
        action: action || 'ACTION',
        resource_type: resource_type || 'General',
        resource_id: resource_id || '',
        description: description || '',
        created_at: now
      };

      await GoogleSheetsRepository.appendRow(
        tokens,
        business.spreadsheet_id || '',
        'ActivityLogs',
        logRecord
      ).catch(err => console.warn('Activity log write fallback:', err.message));

      return logRecord;
    } catch (err) {
      console.error('Failed to log activity:', err.message);
      return null;
    }
  }

  /**
   * Fetch activity audit logs for the business
   */
  static async getLogs(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return [];

    const rows = await GoogleSheetsRepository.getRows(
      tokens,
      business.spreadsheet_id || '',
      'ActivityLogs'
    );

    if (!Array.isArray(rows)) return [];

    return rows
      .filter(r => r && r.business_id === business.business_id)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }
}
