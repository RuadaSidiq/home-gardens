/**
 * Home Gardens – relational schema.
 *
 * Conventions
 * - Money is stored as integer minor units (e.g. pesewas, cents) in `bigint` columns,
 *   always next to a 3-letter ISO currency code.
 * - Timestamps are `timestamptz`.
 * - Constraints that Drizzle cannot express (exclusion constraints, partial checks)
 *   live in drizzle/0001_constraints.sql.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  numeric,
  primaryKey,
  index,
  uniqueIndex,
  check,
  serial,
  smallint,
  time,
  date,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */
export const userStatus = pgEnum("user_status", ["active", "suspended", "deactivated"]);
export const gardenerType = pgEnum("gardener_type", ["company", "independent"]);
export const gardenerStatus = pgEnum("gardener_status", [
  "draft",
  "pending",
  "info_requested",
  "approved",
  "rejected",
  "suspended",
]);
export const documentStatus = pgEnum("document_status", ["pending", "verified", "rejected"]);
export const pricingModel = pgEnum("pricing_model", [
  "fixed",
  "starting",
  "hourly",
  "per_sqm",
  "quote",
  "inspection",
]);
export const bookingStatus = pgEnum("booking_status", [
  "awaiting_quote",
  "quoted",
  "awaiting_payment",
  "pending_assignment",
  "assigned",
  "accepted",
  "in_progress",
  "awaiting_confirmation",
  "completed",
  "cancelled",
  "disputed",
]);
export const paymentState = pgEnum("payment_state", [
  "unpaid",
  "deposit_paid",
  "paid",
  "partially_refunded",
  "refunded",
]);
export const assignmentMode = pgEnum("assignment_mode", ["manual", "auto", "customer_choice"]);
export const assignmentStatus = pgEnum("assignment_status", ["offered", "accepted", "rejected", "withdrawn", "expired"]);
export const quoteStatus = pgEnum("quote_status", ["pending", "accepted", "declined", "superseded", "expired"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "partially_refunded",
]);
export const fulfilmentStatus = pgEnum("fulfilment_status", ["unfulfilled", "partial", "fulfilled", "returned"]);
export const paymentStatus = pgEnum("payment_status", [
  "initiated",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);
export const paymentPurpose = pgEnum("payment_purpose", ["booking", "order", "activity"]);
export const refundStatus = pgEnum("refund_status", ["pending", "succeeded", "failed"]);
export const registrationStatus = pgEnum("registration_status", [
  "pending_payment",
  "confirmed",
  "cancelled",
  "attended",
  "no_show",
]);
export const commissionStatus = pgEnum("commission_status", ["pending", "available", "paid", "reversed"]);
export const payoutStatus = pgEnum("payout_status", ["requested", "approved", "processing", "paid", "rejected", "failed"]);
export const reviewStatus = pgEnum("review_status", ["published", "pending", "hidden"]);
export const ticketStatus = pgEnum("ticket_status", ["open", "pending", "resolved", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const ticketCategory = pgEnum("ticket_category", ["general", "booking", "order", "payment", "dispute", "gardener", "account"]);
export const conversationType = pgEnum("conversation_type", ["booking", "support", "direct"]);
export const couponType = pgEnum("coupon_type", ["percent", "fixed"]);
export const couponScope = pgEnum("coupon_scope", ["all", "products", "services", "activities"]);
export const movementReason = pgEnum("movement_reason", [
  "initial",
  "restock",
  "adjustment",
  "sale",
  "cancellation",
  "return",
  "transfer",
  "damage",
]);
export const ledgerAccount = pgEnum("ledger_account", [
  "gross_receipts",
  "company_revenue",
  "gardener_payable",
  "vendor_payable",
  "processing_fees",
  "refunds",
  "tax_collected",
  "payouts",
]);
export const returnStatus = pgEnum("return_status", ["requested", "approved", "rejected", "received", "refunded"]);
export const taxScope = pgEnum("tax_scope", ["all", "products", "services", "activities"]);
export const deliveryType = pgEnum("delivery_type", ["flat", "pickup", "weight"]);
export const fileVisibility = pgEnum("file_visibility", ["public", "private"]);

/* ------------------------------------------------------------------ */
/* Locations, currency & tax                                           */
/* ------------------------------------------------------------------ */
export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  minorUnits: smallint("minor_units").notNull().default(2),
  active: boolean("active").notNull().default(true),
});

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: serial("id").primaryKey(),
    base: varchar("base", { length: 3 }).notNull().references(() => currencies.code),
    quote: varchar("quote", { length: 3 }).notNull().references(() => currencies.code),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: text("source").notNull().default("manual"),
    effectiveAt: ts("effective_at").notNull().defaultNow(),
  },
  (t) => [index("exchange_rates_pair_idx").on(t.base, t.quote, t.effectiveAt)],
);

export const countries = pgTable("countries", {
  code: varchar("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
  phoneCode: text("phone_code").notNull(),
  timezone: text("timezone").notNull(),
  addressFormat: jsonb("address_format").$type<{ postalCodeRequired: boolean; regionLabel: string; postalLabel?: string }>().notNull(),
  paymentProviders: jsonb("payment_providers").$type<string[]>().notNull().default([]),
  servicesEnabled: boolean("services_enabled").notNull().default(false),
  shippingEnabled: boolean("shipping_enabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const regions = pgTable(
  "regions",
  {
    id: serial("id").primaryKey(),
    countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("regions_country_name_uq").on(t.countryCode, t.name)],
);

export const cities = pgTable(
  "cities",
  {
    id: serial("id").primaryKey(),
    regionId: integer("region_id").references(() => regions.id),
    countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    serviceAvailable: boolean("service_available").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("cities_country_slug_uq").on(t.countryCode, t.slug)],
);

export const taxConfigurations = pgTable("tax_configurations", {
  id: serial("id").primaryKey(),
  countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
  name: text("name").notNull(),
  rateBps: integer("rate_bps").notNull(),
  scope: taxScope("scope").notNull().default("all"),
  inclusive: boolean("inclusive").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

/* ------------------------------------------------------------------ */
/* Identity & access                                                   */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    countryCode: varchar("country_code", { length: 2 }).references(() => countries.code),
    preferredCurrency: varchar("preferred_currency", { length: 3 }).references(() => currencies.code),
    emailVerifiedAt: ts("email_verified_at"),
    status: userStatus("status").notNull().default("active"),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    notificationPrefs: jsonb("notification_prefs").$type<{ email: boolean; sms: boolean; whatsapp: boolean; marketing: boolean }>()
      .notNull()
      .default({ email: true, sms: true, whatsapp: false, marketing: false }),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  system: boolean("system").notNull().default(false),
});

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description").notNull(),
  group: text("group").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    mfaPending: boolean("mfa_pending").notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"verify_email" | "reset_password">().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const addresses = pgTable(
  "addresses",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Home"),
    recipient: text("recipient").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    cityId: integer("city_id").references(() => cities.id),
    region: text("region"),
    postalCode: text("postal_code"),
    countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
    digitalAddress: text("digital_address"), // e.g. Ghana Post GPS
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

export const customerProfiles = pgTable("customer_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  gardenNotes: text("garden_notes"),
  referralSource: text("referral_source"),
  createdAt: createdAt(),
});

export const staffProfiles = pgTable("staff_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().unique(),
  department: text("department").notNull(),
  jobTitle: text("job_title").notNull(),
  hiredOn: date("hired_on"),
  createdAt: createdAt(),
});

export const files = pgTable("files", {
  id: id(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  key: text("key").notNull().unique(),
  visibility: fileVisibility("visibility").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  purpose: text("purpose").notNull(),
  originalName: text("original_name"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */
export const serviceCategories = pgTable("service_categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  icon: text("icon").notNull().default("leaf"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const services = pgTable(
  "services",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    categoryId: integer("category_id").notNull().references(() => serviceCategories.id),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull(),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    pricingModel: pricingModel("pricing_model").notNull(),
    basePrice: money("base_price").notNull().default(0), // in `currency`; unit price for hourly / per_sqm
    minimumCharge: money("minimum_charge").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    requirements: text("requirements"),
    includes: jsonb("includes").$type<string[]>().notNull().default([]),
    depositPercent: integer("deposit_percent").notNull().default(30),
    requiresInspection: boolean("requires_inspection").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("services_category_idx").on(t.categoryId),
    check("services_deposit_range", sql`${t.depositPercent} between 0 and 100`),
  ],
);

/** Country specific price overrides. Falls back to services.base_price converted at current rate. */
export const servicePrices = pgTable(
  "service_prices",
  {
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
    currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
    basePrice: money("base_price").notNull(),
    minimumCharge: money("minimum_charge").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.countryCode] })],
);

export const serviceAreas = pgTable(
  "service_areas",
  {
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.cityId] })],
);

/* ------------------------------------------------------------------ */
/* Gardeners                                                           */
/* ------------------------------------------------------------------ */
export const gardenerProfiles = pgTable(
  "gardener_profiles",
  {
    id: id(),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    type: gardenerType("type").notNull(),
    slug: text("slug").notNull().unique(),
    status: gardenerStatus("status").notNull().default("pending"),
    headline: text("headline").notNull().default(""),
    bio: text("bio").notNull().default(""),
    yearsExperience: integer("years_experience").notNull().default(0),
    qualifications: text("qualifications"),
    countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
    baseCityId: integer("base_city_id").references(() => cities.id),
    hourlyRate: money("hourly_rate"),
    currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).notNull().default("0"),
    ratingCount: integer("rating_count").notNull().default(0),
    jobsCompleted: integer("jobs_completed").notNull().default(0),
    maxJobsPerDay: integer("max_jobs_per_day").notNull().default(3),
    isPublic: boolean("is_public").notNull().default(true),
    verifiedAt: ts("verified_at"),
    employeeId: text("employee_id").unique(), // company gardeners only
    compensationNote: text("compensation_note"), // company gardeners only, admin visible
    payoutMethod: text("payout_method"), // encrypted JSON (independent gardeners)
    payoutMethodSummary: text("payout_method_summary"), // masked, safe to display
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    submittedAt: ts("submitted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("gardener_status_idx").on(t.status, t.type), index("gardener_city_idx").on(t.baseCityId)],
);

export const gardenerDocuments = pgTable("gardener_documents", {
  id: id(),
  gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
  type: text("type").$type<"national_id" | "passport" | "drivers_license" | "certificate" | "other">().notNull(),
  fileId: uuid("file_id").notNull().references(() => files.id),
  status: documentStatus("status").notNull().default("pending"),
  note: text("note"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: ts("reviewed_at"),
  createdAt: createdAt(),
});

export const gardenerPortfolio = pgTable("gardener_portfolio", {
  id: id(),
  gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  caption: text("caption"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
});

export const gardenerServices = pgTable(
  "gardener_services",
  {
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    customPrice: money("custom_price"), // gardener's own unit price, in gardener currency
    active: boolean("active").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.gardenerId, t.serviceId] })],
);

export const gardenerServiceAreas = pgTable(
  "gardener_service_areas",
  {
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
    cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.gardenerId, t.cityId] })],
);

/** Weekly recurring working hours in the gardener's local time zone. */
export const gardenerAvailability = pgTable(
  "gardener_availability",
  {
    id: serial("id").primaryKey(),
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 0 = Sunday
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [
    index("availability_gardener_idx").on(t.gardenerId),
    check("availability_weekday", sql`${t.weekday} between 0 and 6`),
    check("availability_order", sql`${t.endTime} > ${t.startTime}`),
  ],
);

export const gardenerTimeOff = pgTable("gardener_time_off", {
  id: id(),
  gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  reason: text("reason"),
});

export const savedGardeners = pgTable(
  "saved_gardeners",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gardenerId] })],
);

/* ------------------------------------------------------------------ */
/* Promotions                                                          */
/* ------------------------------------------------------------------ */
export const coupons = pgTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: couponType("type").notNull(),
  value: integer("value").notNull(), // percent (1-100) or minor units when fixed
  currency: varchar("currency", { length: 3 }).references(() => currencies.code),
  scope: couponScope("scope").notNull().default("all"),
  minSubtotal: money("min_subtotal").notNull().default(0),
  maxUses: integer("max_uses"),
  perUserLimit: integer("per_user_limit").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: id(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id),
  userId: uuid("user_id").references(() => users.id),
  orderId: uuid("order_id"),
  bookingId: uuid("booking_id"),
  amount: money("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    customerId: uuid("customer_id").notNull().references(() => users.id),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    gardenerId: uuid("gardener_id").references(() => gardenerProfiles.id),
    requestedGardenerId: uuid("requested_gardener_id").references(() => gardenerProfiles.id),
    status: bookingStatus("status").notNull(),
    paymentState: paymentState("payment_state").notNull().default("unpaid"),
    assignmentMode: assignmentMode("assignment_mode").notNull(),
    scheduledStart: ts("scheduled_start").notNull(),
    scheduledEnd: ts("scheduled_end").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
    cityId: integer("city_id").references(() => cities.id),
    address: jsonb("address").$type<{ line1: string; line2?: string; city: string; region?: string; digitalAddress?: string; countryCode: string }>().notNull(),
    contactPhone: text("contact_phone").notNull(),
    gardenSizeSqm: integer("garden_size_sqm"),
    estimatedHours: numeric("estimated_hours", { precision: 5, scale: 2 }),
    details: text("details").notNull(),
    customerNotes: text("customer_notes"),
    internalNotes: text("internal_notes"),
    currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    tax: money("tax").notNull().default(0),
    total: money("total").notNull().default(0),
    depositAmount: money("deposit_amount").notNull().default(0),
    amountPaid: money("amount_paid").notNull().default(0),
    amountRefunded: money("amount_refunded").notNull().default(0),
    couponId: uuid("coupon_id").references(() => coupons.id),
    priceIsFinal: boolean("price_is_final").notNull().default(true),
    cancellationReason: text("cancellation_reason"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: ts("cancelled_at"),
    startedAt: ts("started_at"),
    gardenerCompletedAt: ts("gardener_completed_at"),
    completedAt: ts("completed_at"),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_customer_idx").on(t.customerId, t.createdAt),
    index("bookings_gardener_idx").on(t.gardenerId, t.scheduledStart),
    index("bookings_status_idx").on(t.status),
    check("bookings_time_order", sql`${t.scheduledEnd} > ${t.scheduledStart}`),
    check("bookings_amounts", sql`${t.total} >= 0 and ${t.amountPaid} >= 0 and ${t.amountRefunded} <= ${t.amountPaid}`),
  ],
);

export const bookingMedia = pgTable("booking_media", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"request" | "before" | "after">().notNull(),
  url: text("url").notNull(),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const bookingAssignments = pgTable(
  "booking_assignments",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id),
    method: assignmentMode("method").notNull(),
    status: assignmentStatus("status").notNull().default("offered"),
    score: numeric("score", { precision: 6, scale: 3 }),
    assignedBy: uuid("assigned_by").references(() => users.id),
    reason: text("reason"),
    respondedAt: ts("responded_at"),
    createdAt: createdAt(),
  },
  (t) => [index("assignments_booking_idx").on(t.bookingId), index("assignments_gardener_idx").on(t.gardenerId, t.status)],
);

export const bookingQuotes = pgTable("booking_quotes", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  gardenerId: uuid("gardener_id").references(() => gardenerProfiles.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  amount: money("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  estimatedHours: numeric("estimated_hours", { precision: 5, scale: 2 }),
  note: text("note"),
  status: quoteStatus("status").notNull().default("pending"),
  validUntil: ts("valid_until"),
  respondedAt: ts("responded_at"),
  createdAt: createdAt(),
});

export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: bookingStatus("from_status"),
    toStatus: bookingStatus("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("booking_history_idx").on(t.bookingId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */
export const activities = pgTable("activities", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").notNull(), // workshop, tour, exhibition, lesson, community, class, school, family, corporate
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  organizer: text("organizer").notNull(),
  venue: text("venue").notNull(),
  address: text("address").notNull(),
  cityId: integer("city_id").references(() => cities.id),
  countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
  price: money("price").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
  defaultCapacity: integer("default_capacity").notNull().default(20),
  maxPerBooking: integer("max_per_booking").notNull().default(6),
  bookingDeadlineHours: integer("booking_deadline_hours").notNull().default(24),
  requirements: text("requirements"),
  recurrence: text("recurrence").$type<"none" | "weekly" | "monthly">().notNull().default("none"),
  requiresPayment: boolean("requires_payment").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const activitySessions = pgTable(
  "activity_sessions",
  {
    id: id(),
    activityId: uuid("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    capacity: integer("capacity").notNull(),
    seatsTaken: integer("seats_taken").notNull().default(0),
    status: text("status").$type<"scheduled" | "cancelled" | "completed">().notNull().default("scheduled"),
  },
  (t) => [
    index("activity_sessions_idx").on(t.activityId, t.startsAt),
    check("activity_seats", sql`${t.seatsTaken} >= 0 and ${t.seatsTaken} <= ${t.capacity}`),
  ],
);

export const activityRegistrations = pgTable(
  "activity_registrations",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    sessionId: uuid("session_id").notNull().references(() => activitySessions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    quantity: integer("quantity").notNull(),
    attendeeNames: jsonb("attendee_names").$type<string[]>().notNull().default([]),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: registrationStatus("status").notNull(),
    paymentState: paymentState("payment_state").notNull().default("unpaid"),
    checkedInAt: ts("checked_in_at"),
    createdAt: createdAt(),
  },
  (t) => [index("registrations_user_idx").on(t.userId), check("registration_qty", sql`${t.quantity} > 0`)],
);

/* ------------------------------------------------------------------ */
/* Commerce                                                            */
/* ------------------------------------------------------------------ */
export const vendors = pgTable("vendors", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  userId: uuid("user_id").references(() => users.id),
  email: text("email").notNull(),
  phone: text("phone"),
  commissionBps: integer("commission_bps").notNull().default(1500),
  isCompany: boolean("is_company").notNull().default(false),
  status: text("status").$type<"active" | "suspended">().notNull().default("active"),
  createdAt: createdAt(),
});

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  parentId: integer("parent_id"),
  imageUrl: text("image_url"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    sku: text("sku").notNull().unique(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull(),
    categoryId: integer("category_id").notNull().references(() => productCategories.id),
    brandId: integer("brand_id").references(() => brands.id),
    vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    specs: jsonb("specs").$type<Record<string, string>>().notNull().default({}),
    price: money("price").notNull(),
    salePrice: money("sale_price"),
    currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
    weightGrams: integer("weight_grams").notNull().default(0),
    dimensions: jsonb("dimensions").$type<{ l: number; w: number; h: number }>(),
    shippable: boolean("shippable").notNull().default(true),
    taxable: boolean("taxable").notNull().default(true),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    allowBackorder: boolean("allow_backorder").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).notNull().default("0"),
    ratingCount: integer("rating_count").notNull().default(0),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    check("products_price", sql`${t.price} >= 0 and (${t.salePrice} is null or ${t.salePrice} < ${t.price})`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull().default("Default"),
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceOverride: money("price_override"),
    salePriceOverride: money("sale_price_override"),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    onHand: integer("on_hand").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.warehouseId] })],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    delta: integer("delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: movementReason("reason").notNull(),
    reference: text("reference"),
    note: text("note"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("movements_variant_idx").on(t.variantId, t.createdAt)],
);

export const carts = pgTable("carts", {
  id: id(),
  userId: uuid("user_id").unique().references(() => users.id, { onDelete: "cascade" }),
  guestToken: text("guest_token").unique(),
  couponCode: text("coupon_code"),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.variantId] }), check("cart_qty", sql`${t.quantity} > 0`)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const shippingZones = pgTable("shipping_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull().references(() => countries.code),
  cityIds: jsonb("city_ids").$type<number[]>().notNull().default([]), // empty = whole country
  active: boolean("active").notNull().default(true),
});

export const deliveryMethods = pgTable("delivery_methods", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").notNull().references(() => shippingZones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: deliveryType("type").notNull(),
  price: money("price").notNull().default(0),
  pricePerKg: money("price_per_kg").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
  freeOver: money("free_over"),
  minDays: integer("min_days").notNull().default(1),
  maxDays: integer("max_days").notNull().default(3),
  active: boolean("active").notNull().default(true),
});

export const orders = pgTable(
  "orders",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    status: orderStatus("status").notNull().default("pending_payment"),
    fulfilmentStatus: fulfilmentStatus("fulfilment_status").notNull().default("unfulfilled"),
    paymentState: paymentState("payment_state").notNull().default("unpaid"),
    currency: varchar("currency", { length: 3 }).notNull().references(() => currencies.code),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull().default("1"),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull().default(0),
    shipping: money("shipping").notNull().default(0),
    tax: money("tax").notNull().default(0),
    total: money("total").notNull(),
    amountPaid: money("amount_paid").notNull().default(0),
    amountRefunded: money("amount_refunded").notNull().default(0),
    shippingAddress: jsonb("shipping_address").$type<Record<string, string>>().notNull(),
    deliveryMethodId: integer("delivery_method_id").references(() => deliveryMethods.id),
    deliveryMethodName: text("delivery_method_name"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    couponId: uuid("coupon_id").references(() => coupons.id),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    stockReserved: boolean("stock_reserved").notNull().default(false),
    paidAt: ts("paid_at"),
    shippedAt: ts("shipped_at"),
    deliveredAt: ts("delivered_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_user_idx").on(t.userId, t.createdAt), index("orders_status_idx").on(t.status)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id),
    vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
    warehouseId: integer("warehouse_id").references(() => warehouses.id),
    name: text("name").notNull(),
    variantName: text("variant_name"),
    sku: text("sku").notNull(),
    image: text("image"),
    unitPrice: money("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: money("line_total").notNull(),
    returnedQuantity: integer("returned_quantity").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_item_qty", sql`${t.quantity} > 0`)],
);

export const orderEvents = pgTable("order_events", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  note: text("note"),
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: createdAt(),
});

export const returnRequests = pgTable("return_requests", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  items: jsonb("items").$type<{ orderItemId: string; quantity: number }[]>().notNull(),
  reason: text("reason").notNull(),
  status: returnStatus("status").notNull().default("requested"),
  adminNote: text("admin_note"),
  restock: boolean("restock").notNull().default(true),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

/* ------------------------------------------------------------------ */
/* Payments & finance                                                  */
/* ------------------------------------------------------------------ */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    reference: text("reference").notNull().unique(), // our reference, sent to provider
    provider: text("provider").notNull(), // paystack | stripe | hubtel | paypal | manual
    providerReference: text("provider_reference"),
    purpose: paymentPurpose("purpose").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    orderId: uuid("order_id").references(() => orders.id),
    registrationId: uuid("registration_id").references(() => activityRegistrations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: text("kind").$type<"full" | "deposit" | "balance">().notNull().default("full"),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    fee: money("fee").notNull().default(0),
    status: paymentStatus("status").notNull().default("initiated"),
    channel: text("channel"), // card, mobile_money, bank ...
    checkoutUrl: text("checkout_url"),
    failureReason: text("failure_reason"),
    amountRefunded: money("amount_refunded").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    providerPayload: jsonb("provider_payload"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_user_idx").on(t.userId),
    index("payments_status_idx").on(t.status, t.createdAt),
    check("payments_one_subject", sql`num_nonnulls(${t.bookingId}, ${t.orderId}, ${t.registrationId}) = 1`),
  ],
);

export const paymentEvents = pgTable("payment_events", {
  id: id(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: ts("processed_at"),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("payment_events_uq").on(t.provider, t.eventId)]);

export const refunds = pgTable("refunds", {
  id: id(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  amount: money("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  reason: text("reason").notNull(),
  status: refundStatus("status").notNull().default("pending"),
  providerReference: text("provider_reference"),
  failureReason: text("failure_reason"),
  processedBy: uuid("processed_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [check("refund_positive", sql`${t.amount} > 0`)]);

/** Double-entry style journal; every money movement is recorded here. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    account: ledgerAccount("account").notNull(),
    amount: money("amount").notNull(), // signed
    currency: varchar("currency", { length: 3 }).notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    refundId: uuid("refund_id").references(() => refunds.id),
    payoutId: uuid("payout_id"),
    bookingId: uuid("booking_id").references(() => bookings.id),
    orderId: uuid("order_id").references(() => orders.id),
    registrationId: uuid("registration_id").references(() => activityRegistrations.id),
    gardenerId: uuid("gardener_id").references(() => gardenerProfiles.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    revenueStream: text("revenue_stream").$type<"services" | "products" | "activities">(),
    description: text("description").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_account_idx").on(t.account, t.createdAt), index("ledger_gardener_idx").on(t.gardenerId)],
);

export const commissionRules = pgTable("commission_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serviceCategoryId: integer("service_category_id").references(() => serviceCategories.id),
  countryCode: varchar("country_code", { length: 2 }).references(() => countries.code),
  rateBps: integer("rate_bps").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [check("commission_rate_range", sql`${t.rateBps} between 0 and 10000`)]);

export const commissions = pgTable(
  "commissions",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id),
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id),
    ruleId: integer("rule_id").references(() => commissionRules.id),
    grossAmount: money("gross_amount").notNull(),
    rateBps: integer("rate_bps").notNull(),
    commissionAmount: money("commission_amount").notNull(),
    gardenerAmount: money("gardener_amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: commissionStatus("status").notNull().default("pending"),
    availableAt: ts("available_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("commissions_gardener_idx").on(t.gardenerId, t.status)],
);

export const gardenerWallets = pgTable(
  "gardener_wallets",
  {
    gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id, { onDelete: "cascade" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    pendingBalance: money("pending_balance").notNull().default(0),
    availableBalance: money("available_balance").notNull().default(0),
    reservedBalance: money("reserved_balance").notNull().default(0), // requested payouts
    totalEarned: money("total_earned").notNull().default(0),
    totalPaidOut: money("total_paid_out").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.gardenerId, t.currency] }),
    check("wallet_non_negative", sql`${t.availableBalance} >= 0 and ${t.reservedBalance} >= 0 and ${t.pendingBalance} >= 0`),
  ],
);

export const payouts = pgTable("payouts", {
  id: id(),
  reference: text("reference").notNull().unique(),
  gardenerId: uuid("gardener_id").notNull().references(() => gardenerProfiles.id),
  amount: money("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: payoutStatus("status").notNull().default("requested"),
  methodSummary: text("method_summary").notNull(),
  provider: text("provider"),
  providerReference: text("provider_reference"),
  note: text("note"),
  processedBy: uuid("processed_by").references(() => users.id),
  processedAt: ts("processed_at"),
  createdAt: createdAt(),
}, (t) => [check("payout_positive", sql`${t.amount} > 0`)]);

/* ------------------------------------------------------------------ */
/* Reviews, messaging, notifications, support                          */
/* ------------------------------------------------------------------ */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    authorId: uuid("author_id").notNull().references(() => users.id),
    subjectType: text("subject_type").$type<"gardener" | "product" | "activity">().notNull(),
    gardenerId: uuid("gardener_id").references(() => gardenerProfiles.id),
    productId: uuid("product_id").references(() => products.id),
    activityId: uuid("activity_id").references(() => activities.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    orderId: uuid("order_id").references(() => orders.id),
    rating: smallint("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    status: reviewStatus("status").notNull().default("published"),
    response: text("response"),
    createdAt: createdAt(),
  },
  (t) => [
    check("review_rating", sql`${t.rating} between 1 and 5`),
    uniqueIndex("review_booking_uq").on(t.authorId, t.bookingId),
    uniqueIndex("review_product_uq").on(t.authorId, t.productId),
    index("reviews_gardener_idx").on(t.gardenerId),
  ],
);

export const conversations = pgTable("conversations", {
  id: id(),
  type: conversationType("type").notNull(),
  subject: text("subject").notNull(),
  bookingId: uuid("booking_id").references(() => bookings.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  lastMessageAt: ts("last_message_at").notNull().defaultNow(),
  createdAt: createdAt(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("participants_user_idx").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<{ url: string; name: string; mime: string }[]>().notNull().default([]),
    internal: boolean("internal").notNull().default(false), // staff-only note in support threads
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const notificationTemplates = pgTable("notification_templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(), // supports {{placeholders}}
  sms: text("sms"),
  channels: jsonb("channels").$type<("in_app" | "email" | "sms" | "whatsapp" | "push")[]>().notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: updatedAt(),
});

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: id(),
  notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  provider: text("provider"),
  recipient: text("recipient"),
  status: text("status").$type<"sent" | "failed" | "skipped">().notNull(),
  error: text("error"),
  createdAt: createdAt(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: createdAt(),
});

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    reference: text("reference").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id),
    category: ticketCategory("category").notNull(),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    priority: ticketPriority("priority").notNull().default("normal"),
    bookingId: uuid("booking_id").references(() => bookings.id),
    orderId: uuid("order_id").references(() => orders.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    resolution: text("resolution"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tickets_status_idx").on(t.status, t.createdAt), index("tickets_user_idx").on(t.userId)],
);

export const contactEnquiries = pgTable("contact_enquiries", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  topic: text("topic").notNull(),
  message: text("message").notNull(),
  status: text("status").$type<"new" | "handled">().notNull().default("new"),
  createdAt: createdAt(),
});

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  email: text("email").primaryKey(),
  countryCode: varchar("country_code", { length: 2 }),
  createdAt: createdAt(),
  unsubscribedAt: ts("unsubscribed_at"),
});

/* ------------------------------------------------------------------ */
/* Content & system                                                    */
/* ------------------------------------------------------------------ */
export const websiteContent = pgTable("website_content", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const testimonials = pgTable("testimonials", {
  id: id(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  quote: text("quote").notNull(),
  rating: smallint("rating").notNull().default(5),
  avatarUrl: text("avatar_url"),
  serviceLabel: text("service_label"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const faqs = pgTable("faqs", {
  id: id(),
  category: text("category").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const gardenProjects = pgTable("garden_projects", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  location: text("location").notNull(),
  summary: text("summary").notNull(),
  beforeUrl: text("before_url").notNull(),
  afterUrl: text("after_url").notNull(),
  serviceCategoryId: integer("service_category_id").references(() => serviceCategories.id),
  durationLabel: text("duration_label"),
  featured: boolean("featured").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

export const pages = pgTable("pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  published: boolean("published").notNull().default(true),
  updatedAt: updatedAt(),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const aiUsage = pgTable("ai_usage", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: createdAt(),
});
