import { ChatbotService } from '../services/ChatbotService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function chatbotRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.post('/api/chatbot/query', async (request, reply) => {
    const { query, history } = request.body || {};
    if (!query || typeof query !== 'string') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query string is required' }
      });
    }

    try {
      const answer = await ChatbotService.askMistral(request.session, query, history || []);
      return { success: true, answer };
    } catch (err) {
      console.error('Chatbot route error:', err.message);
      return reply.status(500).send({
        success: false,
        error: { code: 'CHATBOT_ERROR', message: err.message }
      });
    }
  });
}
