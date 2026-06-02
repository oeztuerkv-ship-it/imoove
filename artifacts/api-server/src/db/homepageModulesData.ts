import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { normalizeGermanMarketingText } from "../lib/germanMarketingText";
import { getDb } from "./client";
import { homepageFaqItemsTable, homepageHowStepsTable, homepageTrustMetricsTable } from "./schema";

export type HomepageFaqItemDto = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
};

export type HomepageHowStepDto = {
  id: string;
  icon: string;
  title: string;
  body: string;
  sortOrder: number;
  isActive: boolean;
};

export type HomepageTrustMetricDto = {
  id: string;
  value: string;
  label: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const FAQ_DEFAULTS: HomepageFaqItemDto[] = [
  {
    id: "faq-default-1",
    question: "Wie buche ich eine Fahrt?",
    answer: "Über die ONRODA App oder über Ihr Partner-Setup. Buchung und Status sind digital nachvollziehbar.",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "faq-default-2",
    question: "Kann ich Fahrten vorplanen?",
    answer: "Ja, Vorbestellungen und Serienfahrten sind möglich.",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "faq-default-3",
    question: "Wie erhalte ich Belege?",
    answer: "Digitale Quittungen und strukturierte Abrechnung stehen je nach Flow zur Verfügung.",
    sortOrder: 30,
    isActive: true,
  },
];

const HOW_DEFAULTS: HomepageHowStepDto[] = [
  { id: "how-default-1", icon: "1", title: "Fahrt anfragen", body: "Start, Ziel und Bedarf digital erfassen.", sortOrder: 10, isActive: true },
  { id: "how-default-2", icon: "2", title: "Vermittlung läuft", body: "Passendes Partnerunternehmen wird strukturiert zugeordnet.", sortOrder: 20, isActive: true },
  { id: "how-default-3", icon: "3", title: "Status & Abrechnung", body: "Fahrtstatus, Kostenstelle und Nachweise bleiben nachvollziehbar.", sortOrder: 30, isActive: true },
];

const TRUST_DEFAULTS: HomepageTrustMetricDto[] = [
  { id: "trust-default-1", value: "Digitale Fahrten", label: "Digitale Fahrten", description: "Organisation und Status digital geführt", sortOrder: 10, isActive: true },
  { id: "trust-default-2", value: "Partnerbetriebe", label: "Partnerbetriebe", description: "Strukturierte Zusammenarbeit im Netzwerk", sortOrder: 20, isActive: true },
  { id: "trust-default-3", value: "Schnelle Vermittlung", label: "Schnelle Vermittlung", description: "Kurze Wege von Anfrage bis Disposition", sortOrder: 30, isActive: true },
  { id: "trust-default-4", value: "Strukturierte Abrechnung", label: "Strukturierte Abrechnung", description: "Kostenstellen und Referenzen sauber zuordenbar", sortOrder: 40, isActive: true },
];

function mapFaqRow(r: typeof homepageFaqItemsTable.$inferSelect): HomepageFaqItemDto {
  return {
    id: r.id,
    question: normalizeGermanMarketingText(r.question),
    answer: normalizeGermanMarketingText(r.answer),
    sortOrder: r.sort_order,
    isActive: r.is_active,
  };
}
function mapHowRow(r: typeof homepageHowStepsTable.$inferSelect): HomepageHowStepDto {
  return {
    id: r.id,
    icon: r.icon,
    title: normalizeGermanMarketingText(r.title),
    body: normalizeGermanMarketingText(r.body),
    sortOrder: r.sort_order,
    isActive: r.is_active,
  };
}
function mapTrustRow(r: typeof homepageTrustMetricsTable.$inferSelect): HomepageTrustMetricDto {
  return {
    id: r.id,
    value: normalizeGermanMarketingText(r.value),
    label: normalizeGermanMarketingText(r.label),
    description: normalizeGermanMarketingText(r.description),
    sortOrder: r.sort_order,
    isActive: r.is_active,
  };
}

export async function listHomepageFaqPublic(): Promise<HomepageFaqItemDto[]> {
  const db = getDb();
  if (!db) return FAQ_DEFAULTS.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await db
    .select()
    .from(homepageFaqItemsTable)
    .where(eq(homepageFaqItemsTable.is_active, true))
    .orderBy(asc(homepageFaqItemsTable.sort_order), asc(homepageFaqItemsTable.created_at));
  if (rows.length === 0) return FAQ_DEFAULTS.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(mapFaqRow);
}

export async function listHomepageFaqAdmin(): Promise<HomepageFaqItemDto[]> {
  const db = getDb();
  if (!db) return [...FAQ_DEFAULTS].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await db.select().from(homepageFaqItemsTable).orderBy(asc(homepageFaqItemsTable.sort_order), asc(homepageFaqItemsTable.created_at));
  if (rows.length === 0) return [...FAQ_DEFAULTS].sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(mapFaqRow);
}

export async function createHomepageFaqItem(input: {
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  actorAdminUserId?: string | null;
}): Promise<HomepageFaqItemDto | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const id = randomUUID();
  const question = normalizeGermanMarketingText(input.question.trim());
  const answer = normalizeGermanMarketingText(input.answer.trim());
  await db.insert(homepageFaqItemsTable).values({
    id,
    question,
    answer,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    created_by_admin_user_id: input.actorAdminUserId ?? null,
    updated_by_admin_user_id: input.actorAdminUserId ?? null,
    created_at: now,
    updated_at: now,
  });
  return { id, question, answer, sortOrder: input.sortOrder, isActive: input.isActive };
}

export async function patchHomepageFaqItem(
  id: string,
  patch: Partial<Omit<HomepageFaqItemDto, "id">>,
  actorAdminUserId?: string | null,
): Promise<HomepageFaqItemDto | null> {
  const db = getDb();
  if (!db) return null;
  const set: Partial<typeof homepageFaqItemsTable.$inferInsert> = {
    updated_by_admin_user_id: actorAdminUserId ?? null,
    updated_at: new Date(),
  };
  if (typeof patch.question === "string") set.question = normalizeGermanMarketingText(patch.question.trim());
  if (typeof patch.answer === "string") set.answer = normalizeGermanMarketingText(patch.answer.trim());
  if (typeof patch.sortOrder === "number") set.sort_order = patch.sortOrder;
  if (typeof patch.isActive === "boolean") set.is_active = patch.isActive;
  await db.update(homepageFaqItemsTable).set(set).where(eq(homepageFaqItemsTable.id, id));
  const rows = await db.select().from(homepageFaqItemsTable).where(eq(homepageFaqItemsTable.id, id)).limit(1);
  return rows[0] ? mapFaqRow(rows[0]) : null;
}

export async function deleteHomepageFaqItem(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const out = await db.delete(homepageFaqItemsTable).where(eq(homepageFaqItemsTable.id, id)).returning({ id: homepageFaqItemsTable.id });
  return out.length > 0;
}

export async function listHomepageHowPublic(): Promise<HomepageHowStepDto[]> {
  const db = getDb();
  if (!db) return HOW_DEFAULTS.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await db
    .select()
    .from(homepageHowStepsTable)
    .where(eq(homepageHowStepsTable.is_active, true))
    .orderBy(asc(homepageHowStepsTable.sort_order), asc(homepageHowStepsTable.created_at));
  if (rows.length === 0) return HOW_DEFAULTS.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(mapHowRow);
}

export async function listHomepageHowAdmin(): Promise<HomepageHowStepDto[]> {
  const db = getDb();
  if (!db) return [...HOW_DEFAULTS].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await db.select().from(homepageHowStepsTable).orderBy(asc(homepageHowStepsTable.sort_order), asc(homepageHowStepsTable.created_at));
  if (rows.length === 0) return [...HOW_DEFAULTS].sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(mapHowRow);
}

export async function createHomepageHowStep(input: {
  icon: string;
  title: string;
  body: string;
  sortOrder: number;
  isActive: boolean;
  actorAdminUserId?: string | null;
}): Promise<HomepageHowStepDto | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const id = randomUUID();
  const title = normalizeGermanMarketingText(input.title.trim());
  const body = normalizeGermanMarketingText(input.body.trim());
  await db.insert(homepageHowStepsTable).values({
    id,
    icon: input.icon,
    title,
    body,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    created_by_admin_user_id: input.actorAdminUserId ?? null,
    updated_by_admin_user_id: input.actorAdminUserId ?? null,
    created_at: now,
    updated_at: now,
  });
  return { id, icon: input.icon, title, body, sortOrder: input.sortOrder, isActive: input.isActive };
}

export async function patchHomepageHowStep(
  id: string,
  patch: Partial<Omit<HomepageHowStepDto, "id">>,
  actorAdminUserId?: string | null,
): Promise<HomepageHowStepDto | null> {
  const db = getDb();
  if (!db) return null;
  const set: Partial<typeof homepageHowStepsTable.$inferInsert> = {
    updated_by_admin_user_id: actorAdminUserId ?? null,
    updated_at: new Date(),
  };
  if (typeof patch.icon === "string") set.icon = patch.icon;
  if (typeof patch.title === "string") set.title = normalizeGermanMarketingText(patch.title.trim());
  if (typeof patch.body === "string") set.body = normalizeGermanMarketingText(patch.body.trim());
  if (typeof patch.sortOrder === "number") set.sort_order = patch.sortOrder;
  if (typeof patch.isActive === "boolean") set.is_active = patch.isActive;
  await db.update(homepageHowStepsTable).set(set).where(eq(homepageHowStepsTable.id, id));
  const rows = await db.select().from(homepageHowStepsTable).where(eq(homepageHowStepsTable.id, id)).limit(1);
  return rows[0] ? mapHowRow(rows[0]) : null;
}

export async function deleteHomepageHowStep(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const out = await db.delete(homepageHowStepsTable).where(eq(homepageHowStepsTable.id, id)).returning({ id: homepageHowStepsTable.id });
  return out.length > 0;
}

export async function listHomepageTrustPublic(): Promise<HomepageTrustMetricDto[]> {
  const db = getDb();
  if (!db) return TRUST_DEFAULTS.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await db
    .select()
    .from(homepageTrustMetricsTable)
    .where(eq(homepageTrustMetricsTable.is_active, true))
    .orderBy(asc(homepageTrustMetricsTable.sort_order), asc(homepageTrustMetricsTable.created_at));
  if (rows.length === 0) return TRUST_DEFAULTS.filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(mapTrustRow);
}

export async function listHomepageTrustAdmin(): Promise<HomepageTrustMetricDto[]> {
  const db = getDb();
  if (!db) return [...TRUST_DEFAULTS].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = await db.select().from(homepageTrustMetricsTable).orderBy(asc(homepageTrustMetricsTable.sort_order), asc(homepageTrustMetricsTable.created_at));
  if (rows.length === 0) return [...TRUST_DEFAULTS].sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(mapTrustRow);
}

export async function createHomepageTrustMetric(input: {
  value: string;
  label: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  actorAdminUserId?: string | null;
}): Promise<HomepageTrustMetricDto | null> {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const id = randomUUID();
  const value = normalizeGermanMarketingText(input.value.trim());
  const label = normalizeGermanMarketingText(input.label.trim());
  const description = normalizeGermanMarketingText(input.description.trim());
  await db.insert(homepageTrustMetricsTable).values({
    id,
    value,
    label,
    description,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    created_by_admin_user_id: input.actorAdminUserId ?? null,
    updated_by_admin_user_id: input.actorAdminUserId ?? null,
    created_at: now,
    updated_at: now,
  });
  return {
    id,
    value,
    label,
    description,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  };
}

export async function patchHomepageTrustMetric(
  id: string,
  patch: Partial<Omit<HomepageTrustMetricDto, "id">>,
  actorAdminUserId?: string | null,
): Promise<HomepageTrustMetricDto | null> {
  const db = getDb();
  if (!db) return null;
  const set: Partial<typeof homepageTrustMetricsTable.$inferInsert> = {
    updated_by_admin_user_id: actorAdminUserId ?? null,
    updated_at: new Date(),
  };
  if (typeof patch.value === "string") set.value = normalizeGermanMarketingText(patch.value.trim());
  if (typeof patch.label === "string") set.label = normalizeGermanMarketingText(patch.label.trim());
  if (typeof patch.description === "string") {
    set.description = normalizeGermanMarketingText(patch.description.trim());
  }
  if (typeof patch.sortOrder === "number") set.sort_order = patch.sortOrder;
  if (typeof patch.isActive === "boolean") set.is_active = patch.isActive;
  await db.update(homepageTrustMetricsTable).set(set).where(eq(homepageTrustMetricsTable.id, id));
  const rows = await db.select().from(homepageTrustMetricsTable).where(eq(homepageTrustMetricsTable.id, id)).limit(1);
  return rows[0] ? mapTrustRow(rows[0]) : null;
}

export async function deleteHomepageTrustMetric(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const out = await db.delete(homepageTrustMetricsTable).where(eq(homepageTrustMetricsTable.id, id)).returning({ id: homepageTrustMetricsTable.id });
  return out.length > 0;
}
