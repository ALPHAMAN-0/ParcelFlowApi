import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { trackingLimiter } from '../../middleware/rateLimit.js';
import {
  idParamsSchema,
  trackingCodeParamsSchema,
  createParcelSchema,
  listParcelsQuerySchema,
  updateStatusSchema,
  assignStaffSchema,
} from './parcels.schemas.js';
import * as controller from './parcels.controller.js';

export const parcelsRouter = Router();

// Every route spells out its own pipeline. Record-level visibility is not here,
// it is applied inside the service by scopeFor().

parcelsRouter.post('/', authenticate, authorize('CUSTOMER', 'ADMIN'), validate({ body: createParcelSchema }), controller.create);

parcelsRouter.get('/', authenticate, validate({ query: listParcelsQuerySchema }), controller.list);

parcelsRouter.get('/:id/history', authenticate, validate({ params: idParamsSchema }), controller.history);

parcelsRouter.patch(
  '/:id/status',
  authenticate,
  authorize('DELIVERY_STAFF', 'ADMIN'),
  validate({ params: idParamsSchema, body: updateStatusSchema }),
  controller.updateStatus,
);

parcelsRouter.patch(
  '/:id/assign',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParamsSchema, body: assignStaffSchema }),
  controller.assign,
);


parcelsRouter.get(
  '/:trackingCode',
  trackingLimiter,
  authenticate,
  validate({ params: trackingCodeParamsSchema }),
  controller.getByTrackingCode,
);