import crypto from 'crypto';
import { GoogleSheetsRepository } from '../repositories/GoogleSheetsRepository.js';
import { UserEmailService } from './UserEmailService.js';
import { AuditLogService } from './AuditLogService.js';

export class TeamService {
  /**
   * Get all team members for the business
   */
  static async getTeamMembers(session) {
    const { business, tokens } = session;
    if (!business || !business.business_id) return [];

    const rows = await GoogleSheetsRepository.getRows(
      tokens,
      business.spreadsheet_id || '',
      'TeamMembers'
    );

    if (!Array.isArray(rows)) return [];

    return rows.filter(r => r && r.business_id === business.business_id && r.status !== 'deleted');
  }

  /**
   * Invite a new team member to the owner's workspace
   */
  static async inviteMember(session, { email, name = '', role = 'member' }) {
    const { business, user, tokens } = session;
    if (!email) throw new Error('Email address is required to send team invite.');

    const cleanEmail = email.toLowerCase().trim();
    const existingMembers = await this.getTeamMembers(session);
    
    if (existingMembers.some(m => m.email.toLowerCase() === cleanEmail)) {
      throw new Error(`Team member ${cleanEmail} has already been invited or added.`);
    }

    const memberId = `member_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    const memberRecord = {
      member_id: memberId,
      business_id: business.business_id,
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      role: role || 'member',
      status: 'pending',
      invited_by: user?.email || business.email || 'Owner',
      created_at: now,
      updated_at: now
    };

    await GoogleSheetsRepository.appendRow(
      tokens,
      business.spreadsheet_id || '',
      'TeamMembers',
      memberRecord
    );

    // Send invitation email via Owner's Gmail with target invite_biz parameter
    const baseUrl = business.frontend_url || 'https://business-qb-front.pages.dev';
    const inviteLink = `${baseUrl}/login.html?invite_biz=${business.business_id}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
        <div style="border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #0d9488; margin: 0;">${business.business_name || 'Business Workspace'}</h2>
        </div>
        <h3 style="margin-top: 0;">You're Invited to Join Our Billing Workspace</h3>
        <p>Hello,</p>
        <p><strong>${user?.name || business.business_name}</strong> (${user?.email || ''}) has invited you to join <strong>${business.business_name}</strong> as a <strong>${role === 'owner' ? 'Owner' : 'Staff Member'}</strong>.</p>
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b;">Sign in with your Google account (${cleanEmail}) to open this shared business workspace:</p>
          <a href="${inviteLink}" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">Accept Invitation & Sign In</a>
        </div>

        <p style="font-size: 11px; color: #94a3b8; text-align: center;">Note: If you already own another business, you can easily switch between companies using the Workspace Switcher in your header.</p>
      </div>
    `;

    try {
      await UserEmailService.sendGmailMessage(tokens, {
        to: cleanEmail,
        subject: `Team Invitation to join ${business.business_name} Billing Workspace`,
        htmlBody,
        fromName: business.business_name || user?.name
      });
    } catch (err) {
      console.warn('Team invite email fallback:', err.message);
    }

    // Log Activity
    await AuditLogService.logActivity(session, {
      action: 'INVITE_MEMBER',
      resource_type: 'Team',
      resource_id: memberId,
      description: `Invited team member ${cleanEmail} as ${role}`
    });

    return memberRecord;
  }

  /**
   * Delete team member invitation / revoke access
   */
  static async removeMember(session, memberId) {
    const { business, tokens } = session;
    const members = await this.getTeamMembers(session);
    const target = members.find(m => m.member_id === memberId);
    
    if (!target) throw new Error('Team member invitation not found');
    if (target.role === 'owner') throw new Error('Cannot delete primary business owner.');

    // Delete row from Google Sheets TeamMembers tab
    await GoogleSheetsRepository.deleteRow(
      tokens,
      business.spreadsheet_id || '',
      'TeamMembers',
      'member_id',
      memberId
    ).catch(async () => {
      // Fallback: update status to deleted if sheet deleteRow fails
      await GoogleSheetsRepository.updateRow(
        tokens,
        business.spreadsheet_id || '',
        'TeamMembers',
        'member_id',
        memberId,
        { status: 'deleted', updated_at: new Date().toISOString() }
      );
    });

    await AuditLogService.logActivity(session, {
      action: 'DELETE',
      resource_type: 'Team',
      resource_id: memberId,
      description: `Deleted team invitation / access for ${target.email}`
    });

    return { success: true, message: `Team invitation deleted for ${target.email}` };
  }
}
