import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { STATUS_ORDER, ParcelStatus } from '../../domain/parcelStatus.js';
import { publicUserSelect } from '../../middleware/authenticate.js';
import { ROLES } from './admin.schemas.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// groupBy only returns rows for values that occur, so fill the gaps with zeros
// and return a complete shape. Otherwise clients have to handle missing keys.
function toCountMap(rows, key, allKeys) {
  const map = Object.fromEntries(allKeys.map((k) => [k, 0]));
  for (const row of rows) map[row[key]] = row._count._all;
  return map;
}

// Everything here is computed by the database. Nothing loads rows into memory
// to count them. The one raw query is an interval across two tables, which the
// aggregate API cannot express; it is a static template with no interpolation.
export async function getStats() {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  const [totalParcels, byStatus, byRole, unassigned, createdLast7Days, topAreas, [delivery]] = await Promise.all([
    prisma.parcel.count(),
    prisma.parcel.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.parcel.count({ where: { assignedStaffId: null, status: { not: ParcelStatus.DELIVERED } } }),
    prisma.parcel.count({ where: { createdAt: { gte: since } } }),
    prisma.parcel.groupBy({
      by: ['deliveryArea'],
      _count: { _all: true },
      orderBy: { _count: { deliveryArea: 'desc' } },
      take: 5,
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS "deliveredCount",
             AVG(EXTRACT(EPOCH FROM (h."createdAt" - p."createdAt")))::float8 AS "avgSeconds"
      FROM "parcel_status_history" h
      JOIN "parcels" p ON p."id" = h."parcelId"
      WHERE h."newStatus" = 'DELIVERED'
    `,
  ]);

  const statusMap = toCountMap(byStatus, 'status', STATUS_ORDER);
  const delivered = statusMap[ParcelStatus.DELIVERED];
  const avgSeconds = delivery?.avgSeconds ?? null;

  return {
    parcels: {
      total: totalParcels,
      byStatus: statusMap,
      unassigned,
      createdLast7Days,
      deliveryRate: totalParcels === 0 ? 0 : Math.round((delivered / totalParcels) * 1000) / 1000,
    },
    users: {
      total: byRole.reduce((sum, r) => sum + r._count._all, 0),
      byRole: toCountMap(byRole, 'role', ROLES),
    },
    delivery: {
      deliveredCount: delivery?.deliveredCount ?? 0,
      averageHoursToDeliver: avgSeconds === null ? null : Math.round((avgSeconds / 3600) * 100) / 100,
    },
    topDeliveryAreas: topAreas.map((row) => ({ deliveryArea: row.deliveryArea, count: row._count._all })),
    generatedAt: new Date().toISOString(),
  };
}

export async function listUsers(query) {
  const where = {};
  if (query.role) where.role = query.role;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: publicUserSelect, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
    prisma.user.count({ where }),
  ]);

  return {
    items,
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

// Demoting a staff member releases their undelivered parcels in the same
// transaction, so nothing stays assigned to someone who can no longer act on it.
export async function updateUserRole(id, role, actingAdmin) {
  if (id === actingAdmin.id) {
    throw AppError.conflict('You cannot change your own role', 'CANNOT_CHANGE_OWN_ROLE');
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');

  return prisma.$transaction(async (tx) => {
    let releasedParcels = 0;
    if (user.role === 'DELIVERY_STAFF' && role !== 'DELIVERY_STAFF') {
      const { count } = await tx.parcel.updateMany({
        where: { assignedStaffId: id, status: { not: ParcelStatus.DELIVERED } },
        data: { assignedStaffId: null },
      });
      releasedParcels = count;
    }
    const updated = await tx.user.update({ where: { id }, data: { role }, select: publicUserSelect });
    return { user: updated, previousRole: user.role, releasedParcels };
  });
}