import { AuthService } from '../services/AuthService.js';
import { env } from '../config/env.js';

export async function authRoutes(fastify, opts) {
  // Google OAuth URL redirect endpoint
  fastify.get('/api/auth/google/url', async (request, reply) => {
    try {
      const { redirect_uri } = request.query || {};
      const url = AuthService.getAuthUrl(redirect_uri);
      return { success: true, url };
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: { code: 'OAUTH_CONFIG_ERROR', message: err.message }
      });
    }
  });

  // Frontend OAuth Code Exchange endpoint
  fastify.post('/api/auth/google/exchange', async (request, reply) => {
    try {
      const { code, redirect_uri } = request.body || {};
      if (!code) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_CODE', message: 'OAuth authorization code is required' }
        });
      }

      const session = await AuthService.handleOAuthCallback(code, redirect_uri);
      const isProd = env.NODE_ENV === 'production';

      reply.setCookie('session_token', session.sessionToken, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60
      });

      return {
        success: true,
        sessionToken: session.sessionToken,
        onboarding_completed: session.business.onboarding_completed,
        user: session.user,
        business: session.business
      };
    } catch (err) {
      console.error('OAuth Exchange error:', err);
      return reply.status(400).send({
        success: false,
        error: { code: 'OAUTH_EXCHANGE_FAILED', message: err.message }
      });
    }
  });

  // Backend direct OAuth Callback fallback
  fastify.get('/api/auth/google/callback', async (request, reply) => {
    const { code, error } = request.query;

    if (error) {
      console.error('Google OAuth Error Query Param:', error);
      return reply.redirect(`${env.FRONTEND_URL}/login.html?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return reply.redirect(`${env.FRONTEND_URL}/login.html?error=missing_code`);
    }

    try {
      const session = await AuthService.handleOAuthCallback(code);
      const isProd = env.NODE_ENV === 'production';

      reply.setCookie('session_token', session.sessionToken, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60
      });

      const redirectTarget = session.business.onboarding_completed 
        ? `${env.FRONTEND_URL}/dashboard.html` 
        : `${env.FRONTEND_URL}/onboarding.html`;

      return reply.redirect(redirectTarget);
    } catch (err) {
      console.error('OAuth Callback Route Failure Details:', err);
      const errMsg = encodeURIComponent(err.message || 'oauth_failed');
      return reply.redirect(`${env.FRONTEND_URL}/login.html?error=${errMsg}`);
    }
  });

  // Get Current User Profile & Business Details
  fastify.get('/api/auth/me', async (request, reply) => {
    const sessionToken = request.cookies.session_token || request.headers.authorization?.replace('Bearer ', '');
    const session = AuthService.getSession(sessionToken);

    if (!session) {
      return reply.status(401).send({ success: false, authenticated: false });
    }

    return {
      success: true,
      authenticated: true,
      user: session.user,
      business: session.business
    };
  });

  // Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    const sessionToken = request.cookies.session_token || request.headers.authorization?.replace('Bearer ', '');
    if (sessionToken) {
      AuthService.deleteSession(sessionToken);
    }
    const isProd = env.NODE_ENV === 'production';
    reply.clearCookie('session_token', { 
      path: '/', 
      secure: isProd, 
      sameSite: isProd ? 'none' : 'lax' 
    });
    return { success: true, message: 'Logged out successfully' };
  });
}
