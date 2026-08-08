import { AuthService } from '../services/AuthService.js';
import { ApiService } from '../services/ApiService.js';

export async function requireWebSession(request, reply) {
  const sessionCookie = request.cookies.session_token;
  const authHeader = request.headers.authorization;
  let sessionToken = sessionCookie;

  if (!sessionToken && authHeader && authHeader.startsWith('Bearer ')) {
    sessionToken = authHeader.split(' ')[1];
  }

  const session = AuthService.getSession(sessionToken);

  if (!session) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please login with Google.'
      }
    });
  }

  request.session = session;
}

export async function requireApiKey(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key in Authorization header. Format: Bearer biz_live_xxx'
      }
    });
  }

  const apiKeyString = authHeader.substring(7).trim();
  const apiAuth = await ApiService.validateApiKey(apiKeyString);

  if (!apiAuth) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'The provided API key is invalid or has been revoked.'
      }
    });
  }

  request.apiAuth = apiAuth;
  request.session = apiAuth.session;
}

export function requirePermission(permission) {
  return async (request, reply) => {
    if (!request.apiAuth) return;
    const permissions = request.apiAuth.permissions;
    if (permissions.includes('*') || permissions.includes(permission)) {
      return;
    }
    return reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `API key lacks required permission: ${permission}`
      }
    });
  };
}
