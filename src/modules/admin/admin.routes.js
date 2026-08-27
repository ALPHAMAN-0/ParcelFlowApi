import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { listUsersQuerySchema, userIdParamsSchema, updateRoleSchema } from './admin.schemas.js';
import * as controller from './admin.controller.js';

export const adminRouter = Router();

// Declared once for the whole file, so a route added later cannot be left
// unprotected by accident. Authorization before validation, so a non-admin
// learns nothing about the expected request shape.
adminRouter.use(authenticate, authorize('ADMIN'));

adminRouter.get('/stats', controller.stats);
adminRouter.get('/users', validate({ query: listUsersQuerySchema }), controller.listUsers);
adminRouter.patch('/users/:id/role', validate({ params: userIdParamsSchema, body: updateRoleSchema }), controller.updateRole);