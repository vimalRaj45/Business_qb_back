import { ProductService } from '../services/ProductService.js';
import { requireWebSession } from '../middleware/authMiddleware.js';

export async function productRoutes(fastify, opts) {
  fastify.addHook('onRequest', requireWebSession);

  fastify.get('/api/products', async (request, reply) => {
    try {
      const products = await ProductService.getProducts(request.session);
      return { success: true, data: products };
    } catch (err) {
      console.error('Error in GET /api/products:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'PRODUCT_FETCH_ERROR', message: err.message }
      });
    }
  });

  fastify.post('/api/products', async (request, reply) => {
    try {
      const product = await ProductService.createProduct(request.session, request.body || {});
      return { success: true, data: product };
    } catch (err) {
      console.error('Error in POST /api/products:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'PRODUCT_CREATE_ERROR', message: err.message }
      });
    }
  });

  fastify.put('/api/products/:id', async (request, reply) => {
    try {
      const updated = await ProductService.updateProduct(request.session, request.params.id, request.body || {});
      return { success: true, data: updated };
    } catch (err) {
      console.error('Error in PUT /api/products/:id:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'PRODUCT_UPDATE_ERROR', message: err.message }
      });
    }
  });

  fastify.delete('/api/products/:id', async (request, reply) => {
    try {
      await ProductService.deleteProduct(request.session, request.params.id);
      return { success: true, message: 'Product deleted' };
    } catch (err) {
      console.error('Error in DELETE /api/products/:id:', err);
      return reply.status(500).send({
        success: false,
        error: { code: 'PRODUCT_DELETE_ERROR', message: err.message }
      });
    }
  });
}
