import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { AuthService } from './AuthService.js';
import { getGoogleServices } from '../config/google.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.resolve(__dirname, '../data/local_cache.json');

export class BusinessService {
  static async getBusinessProfile(session) {
    const { business, tokens } = session;
    if (business.spreadsheet_id) {
      try {
        const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id, 'Business');
        const current = rows.find(b => b.business_id === business.business_id);
        if (current) return current;
      } catch (err) {
        console.warn('Could not fetch business from sheet:', err.message);
      }
    }
    return business;
  }

  static async updateBusinessProfile(session, updateData) {
    const { business, tokens } = session;

    const merged = {
      ...business,
      ...updateData,
      updated_at: new Date().toISOString()
    };

    Object.assign(session.business, merged);
    AuthService.saveSession(session.sessionToken, session);

    try {
      await GoogleSheetsRepository.updateRow(
        tokens,
        business.spreadsheet_id || '',
        'Business',
        'business_id',
        business.business_id,
        merged
      );
    } catch (err) {
      console.warn('Could not update Google Sheet business row:', err.message);
    }

    return session.business;
  }

  static async completeOnboarding(session, onboardingData) {
    const payload = {
      business_name: onboardingData.business_name || 'My Business',
      business_type: onboardingData.business_type || 'General Business',
      phone: onboardingData.phone || '',
      address: onboardingData.address || '',
      city: onboardingData.city || '',
      state: onboardingData.state || '',
      country: onboardingData.country || '',
      pincode: onboardingData.pincode || '',
      tax_number: onboardingData.tax_number || '',
      currency: onboardingData.currency || 'USD $',
      logo_url: onboardingData.logo_url || '',
      invoice_prefix: onboardingData.invoice_prefix || 'INV-',
      quotation_prefix: onboardingData.quotation_prefix || 'QUO-',
      bank_beneficiary: onboardingData.bank_beneficiary || onboardingData.business_name || '',
      bank_acc_no: onboardingData.bank_acc_no || '',
      bank_ifsc: onboardingData.bank_ifsc || '',
      bank_name: onboardingData.bank_name || '',
      bank_upi: onboardingData.bank_upi || '',
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    };

    return this.updateBusinessProfile(session, payload);
  }

  static async deleteAccount(session) {
    const { business, tokens, sessionToken } = session;
    const spreadsheetId = business.spreadsheet_id;

    if (spreadsheetId && tokens && (tokens.access_token || tokens.refresh_token)) {
      try {
        const { drive } = getGoogleServices(tokens);
        await drive.files.delete({ fileId: spreadsheetId });
        console.log(`🗑️ Permanently deleted Google Drive Spreadsheet: ${spreadsheetId}`);
      } catch (err) {
        console.warn('Google Drive file deletion warning:', err.message);
      }
    }

    try {
      if (fs.existsSync(CACHE_FILE)) {
        const content = fs.readFileSync(CACHE_FILE, 'utf-8');
        const cache = JSON.parse(content);

        for (const tab of Object.keys(cache)) {
          if (Array.isArray(cache[tab])) {
            cache[tab] = cache[tab].filter(r => r.business_id !== business.business_id);
          }
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('Local cache cleanup warning:', err.message);
    }

    AuthService.deleteSession(sessionToken);

    return { success: true, message: 'Account and all Google Drive data deleted successfully.' };
  }
}
