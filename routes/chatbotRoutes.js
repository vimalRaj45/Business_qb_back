import { ChatbotService } from '../services/ChatbotService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function chatbotRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  // Chatbot message handler (Supporting both /message and /query)
  const handleChat = async (request, reply) => {
    const { message, query, history } = request.body || {};
    const textQuery = message || query;

    if (!textQuery || typeof textQuery !== 'string') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query string is required' }
      });
    }

    try {
      const answer = await ChatbotService.askMistral(request.session, textQuery, history || []);
      return { success: true, reply: answer, answer };
    } catch (err) {
      console.error('Chatbot route error:', err.message);
      return reply.status(500).send({
        success: false,
        error: { code: 'CHATBOT_ERROR', message: err.message }
      });
    }
  };

  fastify.post('/api/chatbot/message', handleChat);
  fastify.post('/api/chatbot/query', handleChat);
}
