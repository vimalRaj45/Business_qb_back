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

  // Frontend OAuth Code Exchange endpoint (supports invite_biz target)
  fastify.post('/api/auth/google/exchange', async (request, reply) => {
    try {
      const { code, redirect_uri, invite_biz } = request.body || {};
      if (!code) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_CODE', message: 'OAuth authorization code is required' }
        });
      }

      const session = await AuthService.handleOAuthCallback(code, redirect_uri, invite_biz);
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
        business: session.business,
        role: session.role || 'owner',
        workspaces: session.workspaces || []
      };
    } catch (err) {
      console.error('OAuth Exchange error:', err);
      let userMsg = err.message || 'OAuth exchange failed';
      if (userMsg.includes('invalid_grant') || userMsg.includes('Bad Request') || userMsg.includes('400')) {
        userMsg = 'OAuth code expired or already used. Please click "Sign in with Google" again.';
      }
      return reply.status(400).send({
        success: false,
        error: { code: 'OAUTH_EXCHANGE_FAILED', message: userMsg }
      });
    }
  });

  // Get Current User Profile, Active Business, Role & Workspaces
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
      business: session.business,
      role: session.role || (session.business?.owner_google_id === session.user?.googleId ? 'owner' : 'member'),
      workspaces: session.workspaces || []
    };
  });

  // Switch Active Workspace
  fastify.post('/api/auth/switch-workspace', async (request, reply) => {
    const sessionToken = request.cookies.session_token || request.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    try {
      const { business_id } = request.body || {};
      if (!business_id) {
        return reply.status(400).send({ success: false, error: { code: 'MISSING_BIZ_ID', message: 'Target business_id is required' } });
      }

      const updatedSession = AuthService.switchWorkspace(sessionToken, business_id);
      return {
        success: true,
        message: `Switched to workspace: ${updatedSession.business.business_name || 'Business'}`,
        business: updatedSession.business,
        role: updatedSession.role,
        workspaces: updatedSession.workspaces
      };
    } catch (err) {
      return reply.status(400).send({ success: false, error: { code: 'SWITCH_FAILED', message: err.message } });
    }
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
