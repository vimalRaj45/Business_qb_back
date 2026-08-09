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
    const email = profile.email ? profile.email.toLowerCase().trim() : '';
    let role = 'owner';

    // Check if user is an invited Team Member in any active session business
    let targetBusiness = null;
    let targetTokens = tokens;

    for (const [, existingSession] of SESSIONS.entries()) {
      if (existingSession && existingSession.business && existingSession.tokens) {
        try {
          const members = await GoogleSheetsRepository.getRows(
            existingSession.tokens,
            existingSession.business.spreadsheet_id || '',
            'TeamMembers'
          );
          const match = (Array.isArray(members) ? members : []).find(
            m => m && m.email && m.email.toLowerCase().trim() === email && m.status !== 'revoked'
          );

          if (match) {
            targetBusiness = existingSession.business;
            targetTokens = existingSession.tokens; // Use workspace spreadsheet tokens
            role = match.role || 'member';

            // Mark invite active if pending
            if (match.status === 'pending') {
              await GoogleSheetsRepository.updateRow(
                existingSession.tokens,
                existingSession.business.spreadsheet_id,
                'TeamMembers',
                'member_id',
                match.member_id,
                { status: 'active', updated_at: new Date().toISOString() }
              ).catch(() => {});
            }
            break;
          }
        } catch (err) {
          // ignore error reading team members from another session
        }
      }
    }

    if (targetBusiness) {
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionData = {
        sessionToken,
        user: {
          googleId,
          email: profile.email || '',
          name: profile.name || 'Team Member',
          picture: profile.picture || ''
        },
        business: targetBusiness,
        tokens: targetTokens,
        role,
        createdAt: Date.now()
      };

      SESSIONS.set(sessionToken, sessionData);
      saveSessionsToDisk(SESSIONS);
      return sessionData;
    }

    // Default Owner Flow
    const businessId = `biz_${crypto.createHash('md5').update(googleId).digest('hex').substring(0, 12)}`;
    const cachedBusiness = getLocalCachedBusiness(googleId);

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
      spreadsheet_id: '',
      invoice_prefix: 'INV-',
      quotation_prefix: 'QUO-',
      onboarding_completed: false,
      created_at: now,
      updated_at: now
    };

    if (cachedBusiness) {
      business = { ...business, ...cachedBusiness };
    }

    let spreadsheetId = business.spreadsheet_id || '';
    try {
      const sheetRes = await GoogleSheetsRepository.ensureBusinessSpreadsheet(tokens, {
        spreadsheet_id: spreadsheetId,
        business_name: business.business_name || `${profile.name || 'My'}'s Business`,
        owner_google_id: googleId
      });
      if (sheetRes && sheetRes.spreadsheetId) {
        spreadsheetId = sheetRes.spreadsheetId;
        business.spreadsheet_id = spreadsheetId;
      }
    } catch (err) {
      console.error('⚠️ Warning: Could not create Google Spreadsheet on login:', err.message);
    }

    // Check Google Sheets for existing business
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
      role: 'owner',
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
