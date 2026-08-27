import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginLimiter } from '../../middleware/rateLimit.js';
import { registerSchema, loginSchema } from './auth.schemas.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), controller.register);

// Limiter runs before validation so a guessing loop is rejected before we
// spend anything parsing its body.
authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);

authRouter.get('/me', authenticate, controller.me);