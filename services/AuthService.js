import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOAuth2Client, GOOGLE_SCOPES } from '../config/google.js';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.resolve(__dirname, '../data');
const SESSIONS_FILE = path.resolve(SESSIONS_DIR, 'sessions.json');
const CACHE_FILE = path.resolve(SESSIONS_DIR, 'local_cache.json');

function ensureSessionFile() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}), 'utf-8');
  }
}

function loadSessionsFromDisk() {
  ensureSessionFile();
  try {
    const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const json = JSON.parse(data);
    return new Map(Object.entries(json));
  } catch (err) {
    return new Map();
  }
}

function saveSessionsToDisk(sessionsMap) {
  ensureSessionFile();
  try {
    const obj = Object.fromEntries(sessionsMap);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing sessions to disk:', err.message);
  }
}

function getLocalCachedBusiness(googleId) {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const content = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(content);
    if (Array.isArray(cache.Business)) {
      return cache.Business.find(b => b.owner_google_id === googleId || b.email);
    }
  } catch (err) {
    return null;
  }
  return null;
}

const SESSIONS = loadSessionsFromDisk();

export class AuthService {
  static getAuthUrl(customRedirectUri) {
    const oauth2Client = getOAuth2Client(customRedirectUri);
    const options = {
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES
    };
    if (customRedirectUri) {
      options.redirect_uri = customRedirectUri;
    }
    return oauth2Client.generateAuthUrl(options);
  }

  static async handleOAuthCallback(code, customRedirectUri) {
    try {
      const oauth2Client = getOAuth2Client(customRedirectUri);
      let tokenRes;
      if (customRedirectUri) {
        tokenRes = await oauth2Client.getToken({ code, redirect_uri: customRedirectUri });
      } else {
        tokenRes = await oauth2Client.getToken(code);
      }
      const tokens = tokenRes.tokens;
      oauth2Client.setCredentials(tokens);

      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const profile = await res.json();

      if (!profile || !profile.id) {
        throw new Error('Could not fetch user profile from Google OAuth');
      }

      return await this.createOrGetUserSession(profile, tokens);
    } catch (err) {
      console.error('❌ AuthService.handleOAuthCallback error:', err);
      throw err;
    }
  }

  static async createOrGetUserSession(profile, tokens) {
    const googleId = profile.id;
    const businessId = `biz_${crypto.createHash('md5').update(googleId).digest('hex').substring(0, 12)}`;

    let spreadsheetId = '';
    try {
      const sheetRes = await GoogleSheetsRepository.ensureBusinessSpreadsheet(tokens, {
        business_name: `${profile.name || 'My'}'s Business`,
        owner_google_id: googleId
      });
      spreadsheetId = sheetRes.spreadsheetId;
    } catch (err) {
      console.error('⚠️ Warning: Could not create Google Spreadsheet on login:', err.message);
    }

    const now = new Date().toISOString();
    let business = {
      business_id: businessId,
      owner_google_id: googleId,
      business_name: '',
      business_type: '',
      email: profile.email || '',
      phone: '',
      address: '',
      city: '',
      state: '',
      country: '',
      pincode: '',
      tax_number: '',
      currency: 'USD $',
      logo_url: profile.picture || '',
      spreadsheet_id: spreadsheetId,
      invoice_prefix: 'INV-',
      quotation_prefix: 'QUO-',
      onboarding_completed: false,
      created_at: now,
      updated_at: now
    };

    // Check local cache first
    const cachedBusiness = getLocalCachedBusiness(googleId);
    if (cachedBusiness) {
      business = { ...business, ...cachedBusiness };
    }

    // Check Google Sheets
    if (spreadsheetId) {
      try {
        const businesses = await GoogleSheetsRepository.getRows(tokens, spreadsheetId, 'Business');
        const existing = businesses.find(b => b.owner_google_id === googleId || b.business_id === businessId || b.email === profile.email);
        if (existing) {
          business = { ...business, ...existing };
        }
      } catch (err) {
        console.warn('Note reading business row:', err.message);
      }
    }

    // Determine onboarding completion status
    const isCompleted = String(business.onboarding_completed) === 'true' || 
                        business.onboarding_completed === true || 
                        (Boolean(business.business_name) && business.business_name.trim() !== '' && !business.business_name.endsWith("'s Business"));

    business.onboarding_completed = isCompleted;

    // Save initial row if not existing
    if (spreadsheetId) {
      await GoogleSheetsRepository.updateRow(tokens, spreadsheetId, 'Business', 'business_id', business.business_id, business).catch(() => {});
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionData = {
      sessionToken,
      user: {
        googleId,
        email: profile.email || '',
        name: profile.name || 'Business Owner',
        picture: profile.picture || ''
      },
      business,
      tokens,
      createdAt: Date.now()
    };

    SESSIONS.set(sessionToken, sessionData);
    saveSessionsToDisk(SESSIONS);
    return sessionData;
  }

  static getSession(sessionToken) {
    if (!sessionToken) return null;
    return SESSIONS.get(sessionToken) || null;
  }

  static saveSession(sessionToken, sessionData) {
    if (sessionToken && sessionData) {
      SESSIONS.set(sessionToken, sessionData);
      saveSessionsToDisk(SESSIONS);
    }
  }

  static deleteSession(sessionToken) {
    if (sessionToken) {
      SESSIONS.delete(sessionToken);
      saveSessionsToDisk(SESSIONS);
    }
  }
}
