import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, issuanceArchivesTable, issuanceEntriesTable, issuanceItemsTable } from "@workspace/db";
import {
  ArchiveCurrentWeekResponse,
  CreateEntryBody,
  CreateEntryResponse,
  CreateItemBody,
  CreateItemResponse,
  DeleteArchiveParams,
  DeleteEntryParams,
  DeleteItemParams,
  GetArchiveParams,
  GetArchiveResponse,
  GetReportSummaryResponse,
  ListArchivesResponse,
  ListEntriesResponse,
  ListItemsResponse,
  UpdateEntryBody,
  UpdateEntryParams,
  UpdateEntryResponse,
  UpdateItemBody,
  UpdateItemParams,
  UpdateItemResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function notFound(res: Parameters<Parameters<IRouter["get"]>[1]>[1]): void {
  res.status(404).json({ error: "Resource not found" });
}

function weekLabel(now: Date): string {
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (date: Date) => date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  return `${format(monday)} – ${format(sunday)}, ${now.getFullYear()}`;
}

router.get("/items", async (_req, res): Promise<void> => {
  const rows = await db.select().from(issuanceItemsTable).orderBy(desc(issuanceItemsTable.createdAt));
  res.json(ListItemsResponse.parse(rows));
});

router.post("/items", async (req, res): Promise<void> => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(issuanceItemsTable).values({ ...parsed.data, id: makeId() }).returning();
  res.status(201).json(CreateItemResponse.parse(item));
});

router.patch("/items/:id", async (req, res): Promise<void> => {
  const params = UpdateItemParams.safeParse(req.params);
  const parsed = UpdateItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.update(issuanceItemsTable).set(parsed.data).where(eq(issuanceItemsTable.id, params.data.id)).returning();
  if (!item) {
    notFound(res);
    return;
  }
  res.json(UpdateItemResponse.parse(item));
});

router.delete("/items/:id", async (req, res): Promise<void> => {
  const params = DeleteItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    await tx.delete(issuanceEntriesTable).where(eq(issuanceEntriesTable.itemId, params.data.id));
    return tx.delete(issuanceItemsTable).where(eq(issuanceItemsTable.id, params.data.id)).returning();
  });
  if (!deleted.length) {
    notFound(res);
    return;
  }
  res.sendStatus(204);
});

router.get("/entries", async (_req, res): Promise<void> => {
  const rows = await db.select().from(issuanceEntriesTable).orderBy(desc(issuanceEntriesTable.issuedAt));
  res.json(ListEntriesResponse.parse(rows));
});

router.post("/entries", async (req, res): Promise<void> => {
  const parsed = CreateEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.select().from(issuanceItemsTable).where(eq(issuanceItemsTable.id, parsed.data.itemId));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const [entry] = await db.insert(issuanceEntriesTable).values({
    id: makeId(),
    person: parsed.data.person,
    itemId: parsed.data.itemId,
    itemName: item.name,
    quantity: parsed.data.quantity,
    unitPrice: item.price,
    remarks: parsed.data.remarks,
    tagSymbol: parsed.data.tagSymbol,
    tagColor: parsed.data.tagColor,
  }).returning();
  res.status(201).json(CreateEntryResponse.parse(entry));
});

router.patch("/entries/:id", async (req, res): Promise<void> => {
  const params = UpdateEntryParams.safeParse(req.params);
  const parsed = UpdateEntryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.select().from(issuanceItemsTable).where(eq(issuanceItemsTable.id, parsed.data.itemId));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const [entry] = await db.update(issuanceEntriesTable).set({
    person: parsed.data.person,
    itemId: parsed.data.itemId,
    itemName: item.name,
    quantity: parsed.data.quantity,
    unitPrice: item.price,
    remarks: parsed.data.remarks,
    tagSymbol: parsed.data.tagSymbol,
    tagColor: parsed.data.tagColor,
  }).where(eq(issuanceEntriesTable.id, params.data.id)).returning();
  if (!entry) {
    notFound(res);
    return;
  }
  res.json(UpdateEntryResponse.parse(entry));
});

router.delete("/entries/:id", async (req, res): Promise<void> => {
  const params = DeleteEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(issuanceEntriesTable).where(eq(issuanceEntriesTable.id, params.data.id)).returning();
  if (!deleted.length) {
    notFound(res);
    return;
  }
  res.sendStatus(204);
});

router.get("/reports/summary", async (_req, res): Promise<void> => {
  const [items, entries] = await Promise.all([
    db.select().from(issuanceItemsTable),
    db.select().from(issuanceEntriesTable),
  ]);
  const people = new Map<string, { quantity: number; total: number; lastIssuedAt: Date }>();
  for (const entry of entries) {
    const current = people.get(entry.person);
    const issuedAt = new Date(entry.issuedAt);
    if (!current) {
      people.set(entry.person, { quantity: entry.quantity, total: entry.quantity * entry.unitPrice, lastIssuedAt: issuedAt });
    } else {
      current.quantity += entry.quantity;
      current.total += entry.quantity * entry.unitPrice;
      if (issuedAt > current.lastIssuedAt) current.lastIssuedAt = issuedAt;
    }
  }
  const summary = {
    totalQuantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    totalPrice: entries.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0),
    peopleCount: people.size,
    catalogCount: items.length,
    peopleTotals: Array.from(people, ([person, values]) => ({ person, ...values })).sort((a, b) => b.total - a.total),
  };
  res.json(GetReportSummaryResponse.parse(summary));
});

router.get("/archives", async (_req, res): Promise<void> => {
  const rows = await db.select().from(issuanceArchivesTable).orderBy(desc(issuanceArchivesTable.archivedAt));
  res.json(ListArchivesResponse.parse(rows));
});

router.post("/archives", async (_req, res): Promise<void> => {
  const now = new Date();
  const archive = await db.transaction(async (tx) => {
    const entries = await tx.select().from(issuanceEntriesTable).orderBy(desc(issuanceEntriesTable.issuedAt));
    if (!entries.length) return null;
    const snapshots = entries.map((entry) => ({ ...entry, issuedAt: new Date(entry.issuedAt).toISOString() }));
    const [created] = await tx.insert(issuanceArchivesTable).values({
      id: makeId(),
      label: weekLabel(now),
      archivedAt: now,
      totalQuantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
      totalPrice: entries.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0),
      entries: snapshots,
    }).returning();
    await tx.delete(issuanceEntriesTable);
    return created;
  });
  if (!archive) {
    res.status(400).json({ error: "There are no active entries to archive." });
    return;
  }
  res.status(201).json(ArchiveCurrentWeekResponse.parse(archive));
});

router.get("/archives/:id", async (req, res): Promise<void> => {
  const params = GetArchiveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [archive] = await db.select().from(issuanceArchivesTable).where(eq(issuanceArchivesTable.id, params.data.id));
  if (!archive) {
    notFound(res);
    return;
  }
  res.json(GetArchiveResponse.parse(archive));
});

router.delete("/archives/:id", async (req, res): Promise<void> => {
  const params = DeleteArchiveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(issuanceArchivesTable).where(eq(issuanceArchivesTable.id, params.data.id)).returning();
  if (!deleted.length) {
    notFound(res);
    return;
  }
  res.sendStatus(204);
});

export default router;