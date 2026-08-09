import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { AuditLogService } from './AuditLogService.js';

export class ProductService {
  static async getProducts(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return [];

    const rows = await GoogleSheetsRepository.getRows(tokens, business.spreadsheet_id || '', 'Products');
    if (!Array.isArray(rows)) return [];

    return rows.filter(r => r && (r.business_id === business.business_id || !r.business_id));
  }

  static async createProduct(session, productData) {
    const { business, tokens } = session;
    const productId = `prod_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    const record = {
      product_id: productId,
      business_id: business ? business.business_id : '',
      name: productData.name || '',
      description: productData.description || '',
      type: productData.type || 'Product',
      sku: productData.sku || '',
      unit: productData.unit || 'PCS',
      price: String(productData.price || 0),
      tax_rate: String(productData.tax_rate || 0),
      stock: String(productData.stock || 0),
      status: productData.status || 'Active',
      created_at: now,
      updated_at: now
    };

    await GoogleSheetsRepository.appendRow(tokens, business ? business.spreadsheet_id : '', 'Products', record);

    await AuditLogService.logActivity(session, {
      action: 'CREATE',
      resource_type: 'Product',
      resource_id: productId,
      description: `Created item "${record.name}" (${record.price})`
    });

    return record;
  }

  static async updateProduct(session, productId, productData) {
    const { business, tokens } = session;
    const updated = await GoogleSheetsRepository.updateRow(
      tokens,
      business ? business.spreadsheet_id : '',
      'Products',
      'product_id',
      productId,
      productData
    );

    await AuditLogService.logActivity(session, {
      action: 'UPDATE',
      resource_type: 'Product',
      resource_id: productId,
      description: `Updated product details`
    });

    return updated;
  }

  static async deleteProduct(session, productId) {
    const { business, tokens } = session;
    const deleted = await GoogleSheetsRepository.deleteRow(
      tokens,
      business ? business.spreadsheet_id : '',
      'Products',
      'product_id',
      productId
    );

    await AuditLogService.logActivity(session, {
      action: 'DELETE',
      resource_type: 'Product',
      resource_id: productId,
      description: `Deleted item record`
    });

    return deleted;
  }
}
