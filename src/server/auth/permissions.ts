/** Permission catalogue. Seeded into the `permissions` table; role grants are editable in /admin/roles. */
export const PERMISSIONS = {
  "dashboard.view": ["Admin", "View the admin dashboard"],
  "bookings.view": ["Bookings", "View bookings"],
  "bookings.manage": ["Bookings", "Create, assign, reschedule and cancel bookings; quote and resolve disputes"],
  "gardeners.view": ["Gardeners", "View gardener profiles and applications"],
  "gardeners.review": ["Gardeners", "Approve, reject, suspend gardeners and verify documents"],
  "staff.manage": ["Staff", "Manage staff accounts and company gardeners"],
  "services.manage": ["Catalogue", "Manage service categories, services and pricing"],
  "activities.manage": ["Catalogue", "Manage activities, sessions, registrations and attendance"],
  "products.manage": ["Catalogue", "Manage products, categories, brands and variants"],
  "inventory.manage": ["Commerce", "Adjust stock and manage warehouses"],
  "orders.manage": ["Commerce", "Fulfil, cancel and process returns for orders"],
  "customers.view": ["Customers", "View customer profiles and history"],
  "customers.manage": ["Customers", "Suspend or reactivate customer accounts"],
  "payments.view": ["Finance", "View payments and transactions"],
  "payments.refund": ["Finance", "Issue refunds and verify manual payments"],
  "commissions.manage": ["Finance", "Configure commission rules"],
  "payouts.manage": ["Finance", "Approve and process gardener payouts"],
  "reports.view": ["Finance", "View business reports"],
  "reviews.moderate": ["Content", "Hide, publish and respond to reviews"],
  "promotions.manage": ["Content", "Manage coupons and promotions"],
  "content.manage": ["Content", "Manage website content, FAQs, testimonials and pages"],
  "locations.manage": ["Settings", "Manage countries, cities, currencies, taxes and delivery"],
  "notifications.manage": ["Settings", "Edit notification templates"],
  "support.manage": ["Support", "Handle support tickets, enquiries and disputes"],
  "users.manage": ["Access", "Manage user accounts and assign roles"],
  "roles.manage": ["Access", "Edit roles and permissions"],
  "settings.manage": ["Settings", "Change system settings"],
  "audit.view": ["Access", "View the audit log"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

const all = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: Permission[]; system?: boolean }> = {
  customer: { name: "Customer", description: "Books services, buys products and registers for activities", permissions: [], system: true },
  gardener: { name: "Gardener", description: "Company or independent gardener with portal access", permissions: [], system: true },
  super_admin: { name: "Super administrator", description: "Full access including roles and settings", permissions: all, system: true },
  admin: {
    name: "Administrator",
    description: "Runs day-to-day operations",
    permissions: all.filter((p) => p !== "roles.manage"),
  },
  operations: {
    name: "Operations",
    description: "Bookings, gardeners, activities and support",
    permissions: ["dashboard.view", "bookings.view", "bookings.manage", "gardeners.view", "gardeners.review", "activities.manage", "customers.view", "support.manage", "reviews.moderate"],
  },
  store_manager: {
    name: "Store manager",
    description: "Products, inventory and orders",
    permissions: ["dashboard.view", "products.manage", "inventory.manage", "orders.manage", "customers.view", "promotions.manage", "reviews.moderate"],
  },
  finance: {
    name: "Finance",
    description: "Payments, refunds, commissions and payouts",
    permissions: ["dashboard.view", "payments.view", "payments.refund", "commissions.manage", "payouts.manage", "reports.view", "bookings.view", "customers.view"],
  },
  support_agent: {
    name: "Support agent",
    description: "Customer and gardener support",
    permissions: ["dashboard.view", "support.manage", "bookings.view", "customers.view", "gardeners.view"],
  },
  content_editor: {
    name: "Content editor",
    description: "Website content and promotions",
    permissions: ["dashboard.view", "content.manage", "promotions.manage", "reviews.moderate"],
  },
};

export const STAFF_ROLE_KEYS = Object.keys(DEFAULT_ROLES).filter((k) => k !== "customer" && k !== "gardener");
