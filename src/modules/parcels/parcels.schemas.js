import { z } from 'zod';
import { STATUS_ORDER } from '../../domain/parcelStatus.js';
import { TRACKING_CODE_PATTERN, normalizeTrackingCode } from '../../utils/trackingCode.js';

const personName = z.string().trim().min(2, 'Must be at least 2 characters').max(100);
const area = z.string().trim().min(2, 'Must be at least 2 characters').max(100);

export const idParamsSchema = z.strictObject({
  id: z.uuid('Must be a valid parcel id (UUID)'),
});

export const trackingCodeParamsSchema = z.strictObject({
  trackingCode: z
    .string()
    .transform(normalizeTrackingCode)
    .pipe(z.string().regex(TRACKING_CODE_PATTERN, 'Invalid tracking code format (expected PF-XXXXX-XXXXX)')),
});

export const createParcelSchema = z.strictObject({
  senderName: personName,
  receiverName: personName,
  pickupArea: area,
  deliveryArea: area,
  parcelType: z.string().trim().min(2).max(50),
});

export const listParcelsQuerySchema = z.strictObject({
  status: z.enum(STATUS_ORDER).optional(),
  deliveryArea: z.string().trim().min(1).max(100).optional(),
  pickupArea: z.string().trim().min(1).max(100).optional(),
  // Partial match, so someone can search from the tail of a damaged label.
  trackingCode: z.string().trim().min(2).max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt:desc', 'createdAt:asc', 'updatedAt:desc', 'updatedAt:asc']).default('createdAt:desc'),
});

export const updateStatusSchema = z.strictObject({
  status: z.enum(STATUS_ORDER, { message: `status must be one of: ${STATUS_ORDER.join(', ')}` }),
});

export const assignStaffSchema = z.strictObject({
  staffId: z.uuid('Must be a valid user id (UUID)').nullable(), // null unassigns
});