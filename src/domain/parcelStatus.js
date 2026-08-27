// Parcel status rules. This module imports nothing, which is what makes it
// testable without a database, a server, or a single mock.
//
// The flow is strictly linear:
//   PENDING -> PICKED_UP -> IN_TRANSIT -> OUT_FOR_DELIVERY -> DELIVERED

export const ParcelStatus = Object.freeze({
  PENDING: 'PENDING',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
});

export const STATUS_ORDER = Object.freeze([
  ParcelStatus.PENDING,
  ParcelStatus.PICKED_UP,
  ParcelStatus.IN_TRANSIT,
  ParcelStatus.OUT_FOR_DELIVERY,
  ParcelStatus.DELIVERED,
]);

export const STATUS_LABELS = Object.freeze({
  PENDING: 'Pending',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
});

// The specification, as data. Adding a status later means editing this object
// and nothing else.
export const TRANSITIONS = Object.freeze({
  PENDING: Object.freeze([ParcelStatus.PICKED_UP]),
  PICKED_UP: Object.freeze([ParcelStatus.IN_TRANSIT]),
  IN_TRANSIT: Object.freeze([ParcelStatus.OUT_FOR_DELIVERY]),
  OUT_FOR_DELIVERY: Object.freeze([ParcelStatus.DELIVERED]),
  DELIVERED: Object.freeze([]), // terminal
});

export function isValidStatus(status) {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, status);
}

export function nextStatuses(from) {
  return TRANSITIONS[from] ?? [];
}

export function isTerminal(status) {
  return isValidStatus(status) && TRANSITIONS[status].length === 0;
}

// True for the four legal moves only. Same-to-same is false, not a no-op.
export function canTransition(from, to) {
  return nextStatuses(from).includes(to);
}

// Returns { ok: true }, or { ok: false, reason } with a message that names the
// current status, the requested one, and the legal next step where there is one.
export function explainTransition(from, to) {
  if (!isValidStatus(from)) return { ok: false, reason: `Unknown current status "${from}"` };
  if (!isValidStatus(to)) return { ok: false, reason: `Unknown target status "${to}"` };
  if (canTransition(from, to)) return { ok: true };

  const fromLabel = STATUS_LABELS[from];
  const toLabel = STATUS_LABELS[to];

  if (from === to) {
    return { ok: false, reason: `Parcel is already ${fromLabel}` };
  }
  if (isTerminal(from)) {
    return { ok: false, reason: `Parcel is ${fromLabel}, which is final; it cannot move to ${toLabel}` };
  }

  const next = STATUS_LABELS[nextStatuses(from)[0]];
  return { ok: false, reason: `Cannot move from ${fromLabel} to ${toLabel}; the only valid next status is ${next}` };
}