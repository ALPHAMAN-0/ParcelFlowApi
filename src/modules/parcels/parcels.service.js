import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { generateTrackingCode, normalizeTrackingCode } from '../../utils/trackingCode.js';
import { ParcelStatus, explainTransition, nextStatuses } from '../../domain/parcelStatus.js';

// The shape every parcel endpoint returns. Relations are expanded to id and
// name only, never the whole user row.
export const parcelSelect = {
  id: true,
  trackingCode: true,
  senderName: true,
  receiverName: true,
  pickupArea: true,
  deliveryArea: true,
  parcelType: true,
  status: true,
  customerId: true,
  assignedStaffId: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true } },
  assignedStaff: { select: { id: true, name: true, email: true } },
};

export const historySelect = {
  id: true,
  oldStatus: true,
  newStatus: true,
  createdAt: true,
  changedBy: { select: { id: true, name: true, role: true } },
};

const historyOrdered = { select: historySelect, orderBy: { createdAt: 'asc' } };

// Spread into the WHERE clause of every read. Customers see what they own,
// staff see what is assigned to them, admins see everything. There is no
// post-fetch ownership check anywhere, because a row outside the caller's
// scope never leaves the database.
export function scopeFor(user) {
  switch (user.role) {
    case 'ADMIN':
      return {};
    case 'DELIVERY_STAFF':
      return { assignedStaffId: user.id };
    case 'CUSTOMER':
      return { customerId: user.id };
    default:
      return { id: { in: [] } }; // unknown role matches nothing: fail closed
  }
}

function isTrackingCodeCollision(err) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    err.meta.target.includes('trackingCode')
  );
}

const MAX_CODE_ATTEMPTS = 5;

// Parcel and its first history row (nothing -> PENDING) go in one transaction,
// so the audit trail is complete from the first event. Tracking code uniqueness
// comes from the UNIQUE constraint; a collision just retries.
export async function createParcel(input, user) {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    const trackingCode = generateTrackingCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const parcel = await tx.parcel.create({
          data: { ...input, trackingCode, customerId: user.id },
          select: parcelSelect,
        });
        await tx.parcelStatusHistory.create({
          data: { parcelId: parcel.id, oldStatus: null, newStatus: ParcelStatus.PENDING, changedById: user.id },
        });
        return parcel;
      });
    } catch (err) {
      if (isTrackingCodeCollision(err) && attempt < MAX_CODE_ATTEMPTS) continue;
      throw err;
    }
  }
  throw new AppError(500, 'TRACKING_CODE_GENERATION_FAILED', 'Could not generate a unique tracking code');
}

export async function listParcels(query, user) {
  const where = { ...scopeFor(user) };
  if (query.status) where.status = query.status;
  // Equality, not search: these are filters backed by the indexes on the table.
  if (query.deliveryArea) where.deliveryArea = { equals: query.deliveryArea, mode: 'insensitive' };
  if (query.pickupArea) where.pickupArea = { equals: query.pickupArea, mode: 'insensitive' };
  if (query.trackingCode) where.trackingCode = { contains: normalizeTrackingCode(query.trackingCode) };

  const [field, direction] = query.sort.split(':');
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.parcel.findMany({ where, select: parcelSelect, orderBy: { [field]: direction }, skip, take: query.limit }),
    prisma.parcel.count({ where }),
  ]);

  return {
    items,
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function getByTrackingCode(trackingCode, user) {
  const parcel = await prisma.parcel.findFirst({
    where: { trackingCode, ...scopeFor(user) },
    select: { ...parcelSelect, history: historyOrdered },
  });
  // Not found and not yours return the same thing on purpose.
  if (!parcel) throw AppError.notFound('Parcel not found', 'PARCEL_NOT_FOUND');
  return parcel;
}

export async function getHistory(id, user) {
  const parcel = await prisma.parcel.findFirst({
    where: { id, ...scopeFor(user) },
    select: { id: true, trackingCode: true, status: true, history: historyOrdered },
  });
  if (!parcel) throw AppError.notFound('Parcel not found', 'PARCEL_NOT_FOUND');
  return { parcelId: parcel.id, trackingCode: parcel.trackingCode, currentStatus: parcel.status, history: parcel.history };
}

// The UPDATE is conditional on the status still being what we read a moment
// ago. If another request moved the parcel first, zero rows match, the
// transaction rolls back, and the caller gets a 409 rather than a duplicated
// history row.
export async function updateStatus(id, nextStatus, user) {
  const scope = scopeFor(user);
  const parcel = await prisma.parcel.findFirst({ where: { id, ...scope }, select: { id: true, status: true } });
  if (!parcel) throw AppError.notFound('Parcel not found', 'PARCEL_NOT_FOUND');

  const verdict = explainTransition(parcel.status, nextStatus);
  if (!verdict.ok) {
    throw AppError.conflict(verdict.reason, 'INVALID_STATUS_TRANSITION', {
      currentStatus: parcel.status,
      requestedStatus: nextStatus,
      allowedNext: nextStatuses(parcel.status),
    });
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.parcel.updateMany({
      where: { id, status: parcel.status, ...scope },
      data: { status: nextStatus },
    });
    if (count === 0) {
      // Throwing in here rolls the transaction back.
      throw AppError.conflict(
        'The parcel status changed while this request was being processed; reload and try again',
        'STATUS_CONFLICT',
        { expectedStatus: parcel.status, requestedStatus: nextStatus },
      );
    }
    await tx.parcelStatusHistory.create({
      data: { parcelId: id, oldStatus: parcel.status, newStatus: nextStatus, changedById: user.id },
    });
    return tx.parcel.findUniqueOrThrow({ where: { id }, select: parcelSelect });
  });
}

// Admin only, enforced at the route. staffId: null clears the assignment.
export async function assignStaff(id, staffId) {
  const parcel = await prisma.parcel.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!parcel) throw AppError.notFound('Parcel not found', 'PARCEL_NOT_FOUND');
  if (parcel.status === ParcelStatus.DELIVERED) {
    throw AppError.conflict('A delivered parcel cannot be reassigned', 'PARCEL_ALREADY_DELIVERED');
  }

  if (staffId !== null) {
    const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, role: true } });
    if (!staff) {
      throw new AppError(422, 'STAFF_NOT_FOUND', 'No user exists with the given staffId', [
        { location: 'body', field: 'staffId', message: 'User not found' },
      ]);
    }
    if (staff.role !== 'DELIVERY_STAFF') {
      throw new AppError(422, 'NOT_DELIVERY_STAFF', 'Parcels can only be assigned to delivery staff', [
        { location: 'body', field: 'staffId', message: `User has role ${staff.role}, expected DELIVERY_STAFF` },
      ]);
    }
  }

  return prisma.parcel.update({ where: { id }, data: { assignedStaffId: staffId }, select: parcelSelect });
}