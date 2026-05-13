// Shared constants used by both Vercel serverless handlers and the local
// dev server. Centralising prevents the kind of drift the end-to-end review
// surfaced — the status enum was previously redefined in 4 places.

// Every status an order can be in. Enforced server-side by PUT /:id/status.
export const VALID_STATUSES = Object.freeze([
  "Pending Payment",
  "Processing",
  "Issued",
  "Cancelled",
  "On Hold",
  "Awaiting Documents",
  "Invoice to be issued",
  "Paid",
  "Awaiting Stripe Payment",
]);

// Statuses for which PUT /:id/amend is permitted. Anything outside this
// list must be cancelled and re-created instead.
export const AMENDABLE_STATUSES = Object.freeze([
  "Invoice to be issued",
  "Pending Payment",
  "Awaiting Stripe Payment",
  "On Hold",
  "Awaiting Documents",
]);

// Status set considered "in flight" — used by the PIQ poll cron when
// scanning candidates and by anywhere else that needs to exclude
// terminal orders.
export const NON_TERMINAL_STATUSES = Object.freeze(
  VALID_STATUSES.filter(s => s !== "Paid" && s !== "Cancelled")
);

// Normalise a lot-number string for fuzzy matching against PIQ lot ledgers.
// Strips common civic prefixes ("Lot 5", "Unit 5", "Apt 5", …) so admin and
// PIQ representations of the same lot compare equal. Single source of truth
// for both the order-creation auto-link and the PIQ poll cron, which had two
// near-identical inline normalisers that drifted (one matched "Apartment",
// the other accidentally didn't).
const LOT_PREFIX_RE = /^(lot|unit|apt|apartment|villa|shop|suite|level|block|stage|tower)\s+/i;
export function normaliseLotNumber(raw) {
  return String(raw || "").trim().toLowerCase().replace(LOT_PREFIX_RE, "").trim();
}
