import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";

export type Settings = {
  company: { name: string; legalName: string; email: string; phone: string; whatsapp: string; address: string; tagline: string };
  booking: {
    autoAssign: boolean;
    minLeadHours: number;
    maxAdvanceDays: number;
    freeCancellationHours: number;
    lateCancellationFeePercent: number;
    maxReschedules: number;
    autoCompleteHours: number;
    gardenerResponseHours: number;
    slotMinutes: number;
  };
  commerce: { allowBackorders: boolean; vendorMarketplace: boolean; returnWindowDays: number; defaultWarehouseCode: string };
  finance: { baseCurrency: string; payoutHoldDays: number; minimumPayout: number; defaultCommissionBps: number };
  social: { facebook: string; instagram: string; x: string; youtube: string };
};

export const DEFAULT_SETTINGS: Settings = {
  company: {
    name: "Home Gardens",
    legalName: "Home Gardens Ltd.",
    email: "hello@homegardens.example",
    phone: "+233 30 000 0000",
    whatsapp: "+233 20 000 0000",
    address: "East Legon, Accra, Ghana",
    tagline: "Garden care, design and supplies",
  },
  booking: {
    autoAssign: true,
    minLeadHours: 18,
    maxAdvanceDays: 90,
    freeCancellationHours: 24,
    lateCancellationFeePercent: 20,
    maxReschedules: 2,
    autoCompleteHours: 72,
    gardenerResponseHours: 12,
    slotMinutes: 60,
  },
  commerce: { allowBackorders: false, vendorMarketplace: false, returnWindowDays: 14, defaultWarehouseCode: "ACC-01" },
  finance: { baseCurrency: "GHS", payoutHoldDays: 3, minimumPayout: 5000, defaultCommissionBps: 1500 },
  social: { facebook: "", instagram: "", x: "", youtube: "" },
};

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(schema.systemSettings);
  const out = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
  for (const r of rows) {
    if (r.key in out) out[r.key] = { ...(out[r.key] as object), ...(r.value as object) };
  }
  return out as Settings;
});

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K], userId: string) {
  await db
    .insert(schema.systemSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.systemSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}

export async function getContent<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(schema.websiteContent).where(eq(schema.websiteContent.key, key)).limit(1);
  return (row?.value as T) ?? fallback;
}
