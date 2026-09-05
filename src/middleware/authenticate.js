import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';


export const publicUserSelect = { id: true, name: true, email: true, role: true, createdAt: true };


export async function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Missing or malformed Authorization header', 'TOKEN_MISSING'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return next(
      AppError.unauthorized(expired ? 'Token has expired' : 'Invalid token', expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'),
    );
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: publicUserSelect });
  if (!user) {
    return next(AppError.unauthorized('The account for this token no longer exists', 'USER_NOT_FOUND'));
  }

  req.user = user;
  return next();
}