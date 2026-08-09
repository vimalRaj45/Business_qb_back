import { TeamService } from '../services/TeamService.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { requireWebSession, requireOwner } from '../middleware/authMiddleware.js';

export async function teamRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  // Get Team Members
  fastify.get('/api/team', async (request, reply) => {
    try {
      const members = await TeamService.getTeamMembers(request.session);
      return { success: true, data: members };
    } catch (err) {
      return reply.status(500).send({ success: false, error: { code: 'TEAM_FETCH_ERROR', message: err.message } });
    }
  });

  // Invite Team Member (Owner Only)
  fastify.post('/api/team/invite', { preHandler: [requireOwner] }, async (request, reply) => {
    try {
      const member = await TeamService.inviteMember(request.session, request.body || {});
      return { success: true, data: member, message: 'Team member invited successfully' };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'INVITE_FAILED', message: err.message } });
    }
  });

  // Revoke Team Member (Owner Only)
  fastify.delete('/api/team/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    try {
      const res = await TeamService.removeMember(request.session, request.params.id);
      return { success: true, message: res.message };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'REVOKE_FAILED', message: err.message } });
    }
  });

  // Get Activity Audit Logs
  fastify.get('/api/activity-logs', async (request, reply) => {
    try {
      const logs = await AuditLogService.getLogs(request.session);
      return { success: true, data: logs };
    } catch (err) {
      return reply.status(500).send({ success: false, error: { code: 'AUDIT_FETCH_ERROR', message: err.message } });
    }
  });
}
