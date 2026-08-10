import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { businessRoutes } from './routes/businessRoutes.js';
import { customerRoutes } from './routes/customerRoutes.js';
import { productRoutes } from './routes/productRoutes.js';
import { quotationRoutes } from './routes/quotationRoutes.js';
import { invoiceRoutes } from './routes/invoiceRoutes.js';
import { paymentRoutes } from './routes/paymentRoutes.js';
import { expenseRoutes } from './routes/expenseRoutes.js';
import { transactionRoutes } from './routes/transactionRoutes.js';
import { reportRoutes } from './routes/reportRoutes.js';
import { developerRoutes } from './routes/developerRoutes.js';
import { developerApiV1Routes } from './routes/developerApiV1Routes.js';
import { chatbotRoutes } from './routes/chatbotRoutes.js';
import { teamRoutes } from './routes/teamRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: true
});

// Register Cookie Support
await fastify.register(fastifyCookie, {
  secret: env.SESSION_SECRET
});

// Register Cross-Origin Resource Sharing (CORS) for Cloudflare Pages + Render
await fastify.register(fastifyCors, {
  origin: (origin, cb) => {
    // Allow all requests in production & development with credentials
    cb(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

await fastify.register(fastifyRateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Rate limit exceeded (100 req/min).'
    }
  })
});

// Serve Static Frontend Assets (For Unified Monolith Hosting)
const frontendPath = path.resolve(__dirname, '../frontend');
await fastify.register(fastifyStatic, {
  root: frontendPath,
  prefix: '/'
});

// Health Check Route
fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Register API Routes
await fastify.register(authRoutes);
await fastify.register(businessRoutes);
await fastify.register(customerRoutes);
await fastify.register(productRoutes);
await fastify.register(quotationRoutes);
await fastify.register(invoiceRoutes);
await fastify.register(paymentRoutes);
await fastify.register(expenseRoutes);
await fastify.register(transactionRoutes);
await fastify.register(reportRoutes);
await fastify.register(developerRoutes);
await fastify.register(developerApiV1Routes);
await fastify.register(chatbotRoutes);
await fastify.register(teamRoutes);

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred'
    }
  });
});

// Start Server
const start = async () => {
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Business Billing Platform Server listening on http://localhost:${env.PORT}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
