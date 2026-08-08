import { ApiService } from '../services/ApiService.js';
import { WebhookService } from '../services/WebhookService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function developerRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  // API Keys
  fastify.get('/api/developer/keys', async (request, reply) => {
    const keys = await ApiService.getApiKeys(request.session);
    return { success: true, data: keys };
  });

  fastify.post('/api/developer/keys', async (request, reply) => {
    const { name, permissions } = request.body || {};
    const keyData = await ApiService.generateApiKey(request.session, name, permissions);
    return { success: true, data: keyData, message: 'API key created successfully. Save it now as it will not be shown again.' };
  });

  fastify.delete('/api/developer/keys/:id', async (request, reply) => {
    await ApiService.deleteApiKey(request.session, request.params.id);
    return { success: true, message: 'API key revoked' };
  });

  // Webhooks
  fastify.get('/api/developer/webhooks', async (request, reply) => {
    const webhooks = await WebhookService.getWebhooks(request.session);
    return { success: true, data: webhooks };
  });

  fastify.post('/api/developer/webhooks', async (request, reply) => {
    const { url, events } = request.body || {};
    const webhook = await WebhookService.createWebhook(request.session, url, events);
    return { success: true, data: webhook };
  });

  fastify.delete('/api/developer/webhooks/:id', async (request, reply) => {
    await WebhookService.deleteWebhook(request.session, request.params.id);
    return { success: true, message: 'Webhook deleted' };
  });

  fastify.get('/api/developer/logs', async (request, reply) => {
    const logs = await WebhookService.getWebhookLogs(request.session);
    return { success: true, data: logs };
  });
}
