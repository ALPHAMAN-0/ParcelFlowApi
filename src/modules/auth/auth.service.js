import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { signToken } from '../../utils/jwt.js';
import { publicUserSelect } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';

// Compared against when the email is unknown, so both failure paths take
// roughly the same time. See login() below.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Z6c4Uqc1c4Yq0X6cZ2Yq0X6cZ2Yq0';

function tokenResponse(user) {
  return { token: signToken(user), tokenType: 'Bearer', expiresIn: env.JWT_EXPIRES_IN, user };
}

// Role is hard-coded, never taken from input. The schema rejects a role field
// already; this is the second layer. Staff and admin accounts come from the
// seed script or from an admin using PATCH /admin/users/:id/role.
export async function register({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const user = await prisma.user.create({
    data: { name, email, password: await hashPassword(password), role: 'CUSTOMER' },
    select: publicUserSelect,
  });

  return tokenResponse(user);
}

// Unknown email and wrong password return the same error, so this endpoint
// can't be used to find out which addresses are registered. Without the dummy
// compare the unknown-email path would return in microseconds instead of the
// ~100ms bcrypt takes, which leaks the answer through timing.
export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.password ?? DUMMY_HASH);
  if (!user || !ok) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  // This query needs the hash, so strip it before returning.
  const { password: _omit, ...publicUser } = user;
  return tokenResponse(publicUser);
}