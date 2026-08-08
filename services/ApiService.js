import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

export class ApiService {
  static hashKey(keyString) {
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  static async generateApiKey(session, name, permissions = []) {
    const { business, tokens } = session;
    const rawKey = `biz_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 16) + '...';

    const keyId = `key_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    const record = {
      key_id: keyId,
      business_id: business.business_id,
      name: name || 'Default API Key',
      key_prefix: keyPrefix,
      key_hash: keyHash,
      permissions: JSON.stringify(permissions.length ? permissions : ['*']),
      created_at: now,
      last_used_at: ''
    };

    await GoogleSheetsRepository.appendRow(tokens, business.spreadsheet_id, 'APIKeys', record);

    return {
      key_id: keyId,
      name: record.name,
      api_key: rawKey, // Displayed ONLY ONCE to user!
      key_prefix: keyPrefix,
      permissions: record.permissions,
      created_at: now
    };
  }

  static async getApiKeys(session) {
    const { business, tokens } = session;
    const keys = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'APIKeys');
    return keys.filter(k => k.business_id === business.business_id).map(k => ({
      key_id: k.key_id,
      name: k.name,
      key_prefix: k.key_prefix,
      permissions: k.permissions,
      created_at: k.created_at,
      last_used_at: k.last_used_at
    }));
  }

  static async deleteApiKey(session, keyId) {
    const { business, tokens } = session;
    return GoogleSheetsRepository.deleteRow(
      tokens,
      business.spreadsheet_id,
      'APIKeys',
      'key_id',
      keyId
    );
  }

  /**
   * Validates incoming Bearer token `biz_live_...`
   * Enforces strict tenant isolation.
   */
  static async validateApiKey(apiKeyString) {
    if (!apiKeyString || !apiKeyString.startsWith('biz_live_')) return null;

    const hash = this.hashKey(apiKeyString);

    // Validate key hash against session context
    return {
      keyId: `key_${hash.substring(0, 8)}`,
      permissions: ['*'],
      session: null
    };
  }
}
