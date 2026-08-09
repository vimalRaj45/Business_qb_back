import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGoogleServices } from '../config/google.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, '../data');
const CACHE_FILE = path.resolve(CACHE_DIR, 'local_cache.json');

export const TAB_SCHEMAS = {
  Business: [
    'business_id', 'owner_google_id', 'business_name', 'business_type', 'email', 
    'phone', 'address', 'city', 'state', 'country', 'pincode', 'tax_number', 
    'currency', 'logo_url', 'spreadsheet_id', 'invoice_prefix', 'quotation_prefix', 
    'bank_beneficiary', 'bank_acc_no', 'bank_ifsc', 'bank_name', 'bank_upi',
    'onboarding_completed', 'created_at', 'updated_at'
  ],
  Customers: [
    'customer_id', 'business_id', 'customer_name', 'company_name', 'email', 
    'phone', 'address', 'city', 'state', 'country', 'tax_number', 
    'opening_balance', 'notes', 'created_at', 'updated_at'
  ],
  Products: [
    'product_id', 'business_id', 'name', 'description', 'type', 'sku', 
    'unit', 'price', 'tax_rate', 'stock', 'status', 'created_at', 'updated_at'
  ],
  Quotations: [
    'quotation_id', 'business_id', 'quotation_number', 'customer_id', 'quotation_date', 
    'valid_until', 'subtotal', 'discount', 'tax', 'total', 'status', 
    'notes', 'terms', 'created_at', 'updated_at'
  ],
  QuotationItems: [
    'quotation_item_id', 'quotation_id', 'product_id', 'description', 'quantity', 
    'unit_price', 'discount', 'tax_rate', 'amount'
  ],
  Invoices: [
    'invoice_id', 'business_id', 'invoice_number', 'quotation_id', 'customer_id', 
    'invoice_date', 'due_date', 'subtotal', 'discount', 'tax', 'total', 
    'paid_amount', 'balance_due', 'status', 'notes', 'terms', 'created_at', 'updated_at'
  ],
  InvoiceItems: [
    'invoice_item_id', 'invoice_id', 'product_id', 'description', 'quantity', 
    'unit_price', 'discount', 'tax_rate', 'amount'
  ],
  Payments: [
    'payment_id', 'business_id', 'invoice_id', 'customer_id', 'payment_date', 
    'amount', 'payment_method', 'reference_number', 'notes', 'created_at'
  ],
  Expenses: [
    'expense_id', 'business_id', 'category', 'description', 'amount', 
    'payment_method', 'expense_date', 'vendor', 'reference', 'notes', 'created_at'
  ],
  Transactions: [
    'transaction_id', 'business_id', 'transaction_date', 'transaction_type', 
    'reference_type', 'reference_id', 'customer_id', 'description', 
    'income', 'expense', 'balance', 'payment_method', 'created_at'
  ],
  Settings: [
    'setting_key', 'setting_value', 'updated_at'
  ],
  APIKeys: [
    'key_id', 'business_id', 'name', 'key_prefix', 'key_hash', 'permissions', 
    'created_at', 'last_used_at'
  ],
  Webhooks: [
    'webhook_id', 'business_id', 'url', 'secret', 'events', 'status', 'created_at'
  ],
  WebhookLogs: [
    'log_id', 'webhook_id', 'event', 'payload', 'status_code', 'response', 
    'attempt', 'created_at'
  ],
  TeamMembers: [
    'member_id', 'business_id', 'email', 'name', 'role', 'status', 'invited_by', 'created_at', 'updated_at'
  ],
  ActivityLogs: [
    'log_id', 'business_id', 'user_google_id', 'user_name', 'user_email', 'user_role', 
    'action', 'resource_type', 'resource_id', 'description', 'created_at'
  ]
};

function ensureCacheFile() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!fs.existsSync(CACHE_FILE)) {
    const initial = {};
    for (const tab of Object.keys(TAB_SCHEMAS)) {
      initial[tab] = [];
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

function readCache() {
  ensureCacheFile();
  try {
    const content = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
}

function writeCache(cacheObj) {
  ensureCacheFile();
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing cache:', err.message);
  }
}

const PRIMARY_KEYS = {
  Business: 'business_id',
  Customers: 'customer_id',
  Products: 'product_id',
  Quotations: 'quotation_id',
  QuotationItems: 'quotation_item_id',
  Invoices: 'invoice_id',
  InvoiceItems: 'invoice_item_id',
  Payments: 'payment_id',
  Expenses: 'expense_id',
  Transactions: 'transaction_id',
  APIKeys: 'key_id',
  Webhooks: 'webhook_id',
  WebhookLogs: 'log_id'
};

export class GoogleSheetsRepository {

  static async ensureBusinessSpreadsheet(tokens, businessInfo) {
    if (!tokens || !tokens.access_token) return { spreadsheetId: '' };

    try {
      const { sheets, drive } = getGoogleServices(tokens);
      let spreadsheetId = businessInfo.spreadsheet_id;

      // 1. Search Google Drive for an existing billing spreadsheet if ID is missing
      if (!spreadsheetId && drive) {
        try {
          const driveSearch = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'Business Billing Data'",
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 5
          });

          if (driveSearch.data && driveSearch.data.files && driveSearch.data.files.length > 0) {
            spreadsheetId = driveSearch.data.files[0].id;
            console.log(`🔍 Found existing Google Spreadsheet in Drive: ${spreadsheetId}`);
          }
        } catch (searchErr) {
          console.warn('Could not search Google Drive for existing spreadsheet:', searchErr.message);
        }
      }

      // 2. Only create a NEW spreadsheet if none exists in Google Drive
      if (!spreadsheetId) {
        const resource = {
          properties: {
            title: businessInfo.business_name ? `${businessInfo.business_name} - Business Billing Data` : 'Business Billing Data',
          },
          sheets: Object.keys(TAB_SCHEMAS).map(tabName => ({
            properties: { title: tabName }
          }))
        };

        const createRes = await sheets.spreadsheets.create({
          resource,
          fields: 'spreadsheetId,spreadsheetUrl'
        });

        spreadsheetId = createRes.data.spreadsheetId;

        for (const [tabName, headers] of Object.entries(TAB_SCHEMAS)) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${tabName}!A1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [headers]
            }
          }).catch(() => {});
        }

        console.log(`✅ Created Google Spreadsheet in user Drive: ${spreadsheetId}`);
      }

      return {
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
      };
    } catch (err) {
      console.warn('Google Sheets creation warning:', err.message);
      return { spreadsheetId: '' };
    }
  }

  static async getRows(tokens, spreadsheetId, tabName) {
    const cache = readCache();
    const cachedRows = cache[tabName] || [];

    if (!spreadsheetId || !tokens || !tokens.access_token) {
      return cachedRows;
    }

    try {
      const { sheets } = getGoogleServices(tokens);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A1:Z5000`
      });

      const values = res.data.values;
      if (!values || values.length <= 1) {
        return cachedRows;
      }

      const headers = values[0];
      const rows = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] !== undefined ? row[index] : '';
        });
        if (tabName === 'Business') {
          const isCompleted = String(obj.onboarding_completed) === 'true' || 
                              obj.onboarding_completed === true || 
                              obj.created_at === 'TRUE' ||
                              (Boolean(obj.business_name) && obj.business_name.trim() !== '' && !obj.business_name.endsWith("'s Business"));
          obj.onboarding_completed = isCompleted;
          if (obj.created_at === 'TRUE') {
            obj.created_at = new Date().toISOString();
          }
        }
        return obj;
      });

      cache[tabName] = rows;
      writeCache(cache);
      return rows;
    } catch (err) {
      console.warn(`Reading ${tabName} from Google Sheets fallback to cache:`, err.message);
      return cachedRows;
    }
  }

  static async appendRow(tokens, spreadsheetId, tabName, rowData) {
    const cache = readCache();
    if (!cache[tabName]) cache[tabName] = [];
    cache[tabName].push(rowData);
    writeCache(cache);

    if (!spreadsheetId || !tokens || !tokens.access_token) return rowData;

    try {
      const { sheets } = getGoogleServices(tokens);
      const headers = TAB_SCHEMAS[tabName] || Object.keys(rowData);
      const rowValues = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowValues]
        }
      });
    } catch (err) {
      console.warn(`Appending row to ${tabName} Google Sheet warning:`, err.message);
    }
    return rowData;
  }

  static async updateRow(tokens, spreadsheetId, tabName, keyName, keyValue, updatedData) {
    const cache = readCache();
    if (cache[tabName]) {
      const idx = cache[tabName].findIndex(item => String(item[keyName]) === String(keyValue));
      if (idx !== -1) {
        cache[tabName][idx] = { ...cache[tabName][idx], ...updatedData };
      } else {
        cache[tabName].push(updatedData);
      }
      writeCache(cache);
    }

    if (!spreadsheetId || !tokens || !tokens.access_token) return updatedData;

    try {
      const rows = await this.getRows(tokens, spreadsheetId, tabName);
      const rowIndex = rows.findIndex(r => String(r[keyName]) === String(keyValue));
      const schemaHeaders = TAB_SCHEMAS[tabName] || Object.keys(updatedData);

      const { sheets } = getGoogleServices(tokens);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [schemaHeaders] }
      }).catch(() => {});

      if (rowIndex !== -1) {
        const sheetRowNumber = rowIndex + 2;
        const mergedRow = { ...rows[rowIndex], ...updatedData };
        const rowValues = schemaHeaders.map(h => mergedRow[h] !== undefined ? mergedRow[h] : '');

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabName}!A${sheetRowNumber}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowValues]
          }
        });
      } else {
        await this.appendRow(tokens, spreadsheetId, tabName, updatedData);
      }
    } catch (err) {
      console.warn(`Updating row in ${tabName} Google Sheet warning:`, err.message);
    }

    return updatedData;
  }

  static async deleteRow(tokens, spreadsheetId, tabName, keyName, keyValue) {
    let rows = [];
    if (spreadsheetId && tokens && tokens.access_token) {
      try {
        rows = await this.getRows(tokens, spreadsheetId, tabName);
      } catch (err) {
        rows = readCache()[tabName] || [];
      }
    } else {
      rows = readCache()[tabName] || [];
    }

    const filtered = (Array.isArray(rows) ? rows : []).filter(r => r && String(r[keyName]) !== String(keyValue));

    const cache = readCache();
    cache[tabName] = filtered;
    writeCache(cache);

    if (!spreadsheetId || !tokens || !tokens.access_token) return true;

    try {
      const headers = TAB_SCHEMAS[tabName] || (filtered.length > 0 ? Object.keys(filtered[0]) : []);

      const { sheets } = getGoogleServices(tokens);
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${tabName}!A2:Z5000`
      });

      if (filtered.length > 0 && headers.length > 0) {
        const values = filtered.map(r => headers.map(h => r[h] !== undefined ? r[h] : ''));
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabName}!A2`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values }
        });
      }
    } catch (err) {
      console.warn(`Deleting row from ${tabName} Google Sheet warning:`, err.message);
    }

    return true;
  }
}
