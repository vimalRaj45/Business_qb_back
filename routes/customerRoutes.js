import { CustomerService } from '../services/CustomerService.js';
import { requireWebSession, requireOwner } from '../middleware/authMiddleware.js';

export async function customerRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/customers', async (request, reply) => {
    const customers = await CustomerService.getCustomers(request.session);
    return { success: true, data: customers };
  });

  fastify.get('/api/customers/:id', async (request, reply) => {
    const customer = await CustomerService.getCustomerById(request.session, request.params.id);
    if (!customer) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    }
    return { success: true, data: customer };
  });

  fastify.post('/api/customers', async (request, reply) => {
    const customer = await CustomerService.createCustomer(request.session, request.body || {});
    return { success: true, data: customer };
  });

  fastify.put('/api/customers/:id', async (request, reply) => {
    const updated = await CustomerService.updateCustomer(request.session, request.params.id, request.body || {});
    return { success: true, data: updated };
  });

  fastify.delete('/api/customers/:id', { preHandler: [requireOwner] }, async (request, reply) => {
    await CustomerService.deleteCustomer(request.session, request.params.id);
    return { success: true, message: 'Customer deleted' };
  });
}
