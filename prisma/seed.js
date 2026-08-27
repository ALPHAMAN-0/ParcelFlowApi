import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { generateTrackingCode } from '../src/utils/trackingCode.js';
import { STATUS_ORDER } from '../src/domain/parcelStatus.js';

const HOUR = 60 * 60 * 1000;

async function upsertUser({ name, email, password, role }) {
  const hashed = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, password: hashed },
    create: { name, email, role, password: hashed },
    select: { id: true, name: true, email: true, role: true },
  });
}

// Builds the full chain of events that would have produced a parcel's current
// status, one step every five hours.
function historyUpTo(targetStatus, createdAt, actors) {
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  const rows = [{ oldStatus: null, newStatus: 'PENDING', changedById: actors.customer, createdAt }];
  for (let i = 1; i <= targetIndex; i += 1) {
    rows.push({
      oldStatus: STATUS_ORDER[i - 1],
      newStatus: STATUS_ORDER[i],
      changedById: actors.staff,
      createdAt: new Date(createdAt.getTime() + i * 5 * HOUR),
    });
  }
  return rows;
}

async function main() {
  console.log('Seeding users…');
  const admin = await upsertUser({ name: 'ParcelFlow Admin', email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, role: 'ADMIN' });
  const staffA = await upsertUser({ name: 'Rahim Uddin', email: 'rahim.staff@parcelflow.dev', password: env.SEED_STAFF_PASSWORD, role: 'DELIVERY_STAFF' });
  const staffB = await upsertUser({ name: 'Karim Ahmed', email: 'karim.staff@parcelflow.dev', password: env.SEED_STAFF_PASSWORD, role: 'DELIVERY_STAFF' });
  const custA = await upsertUser({ name: 'Ayesha Rahman', email: 'ayesha.customer@parcelflow.dev', password: env.SEED_CUSTOMER_PASSWORD, role: 'CUSTOMER' });
  const custB = await upsertUser({ name: 'Tanvir Hasan', email: 'tanvir.customer@parcelflow.dev', password: env.SEED_CUSTOMER_PASSWORD, role: 'CUSTOMER' });

  const existing = await prisma.parcel.count();
  if (existing > 0) {
    console.log(`Parcels already present (${existing}); skipping parcel seed.`);
  } else {
    console.log('Seeding parcels…');
    const now = Date.now();
    const specs = [
      { customer: custA, staff: null,   status: 'PENDING',          from: 'Dhanmondi',   to: 'Gulshan',     type: 'Documents',   ageH: 2 },
      { customer: custA, staff: staffA, status: 'PICKED_UP',        from: 'Mirpur',      to: 'Banani',      type: 'Electronics', ageH: 8 },
      { customer: custB, staff: staffA, status: 'IN_TRANSIT',       from: 'Uttara',      to: 'Motijheel',   type: 'Clothing',    ageH: 14 },
      { customer: custB, staff: staffB, status: 'OUT_FOR_DELIVERY', from: 'Gulshan',     to: 'Mohammadpur', type: 'Fragile',     ageH: 20 },
      { customer: custA, staff: staffB, status: 'DELIVERED',        from: 'Banani',      to: 'Dhanmondi',   type: 'Documents',   ageH: 40 },
      { customer: custB, staff: staffA, status: 'DELIVERED',        from: 'Motijheel',   to: 'Gulshan',     type: 'Groceries',   ageH: 60 },
      { customer: custA, staff: null,   status: 'PENDING',          from: 'Mohammadpur', to: 'Uttara',      type: 'Books',       ageH: 1 },
    ];

    for (const s of specs) {
      const createdAt = new Date(now - s.ageH * HOUR);
      const actors = { customer: s.customer.id, staff: (s.staff ?? staffA).id };
      const parcel = await prisma.parcel.create({
        data: {
          trackingCode: generateTrackingCode(),
          senderName: s.customer.name,
          receiverName: s.status === 'DELIVERED' ? 'Received by household' : 'Recipient',
          pickupArea: s.from,
          deliveryArea: s.to,
          parcelType: s.type,
          status: s.status,
          customerId: s.customer.id,
          assignedStaffId: s.staff?.id ?? null,
          createdAt,
          history: { create: historyUpTo(s.status, createdAt, actors) },
        },
        select: { trackingCode: true, status: true },
      });
      console.log(`  ${parcel.trackingCode}  ${parcel.status}`);
    }
  }

  console.log('\nSeeded accounts (development only):');
  console.table([
    { role: 'ADMIN', email: admin.email, password: env.SEED_ADMIN_PASSWORD },
    { role: 'DELIVERY_STAFF', email: staffA.email, password: env.SEED_STAFF_PASSWORD },
    { role: 'DELIVERY_STAFF', email: staffB.email, password: env.SEED_STAFF_PASSWORD },
    { role: 'CUSTOMER', email: custA.email, password: env.SEED_CUSTOMER_PASSWORD },
    { role: 'CUSTOMER', email: custB.email, password: env.SEED_CUSTOMER_PASSWORD },
  ]);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());