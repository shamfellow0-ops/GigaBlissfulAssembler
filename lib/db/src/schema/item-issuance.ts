import { createInsertSchema } from "drizzle-zod";
import { doublePrecision, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type ArchivedEntry = {
  id: string;
  issuedAt: string | Date;
  person: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  remarks: string;
  tagSymbol: string | null;
  tagColor: string | null;
};

export const issuanceItemsTable = pgTable("issuance_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  price: doublePrecision("price").notNull(),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const issuanceEntriesTable = pgTable("issuance_entries", {
  id: text("id").primaryKey(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  person: text("person").notNull(),
  itemId: text("item_id").notNull(),
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
  remarks: text("remarks").notNull().default(""),
  tagSymbol: text("tag_symbol"),
  tagColor: text("tag_color"),
});

export const issuanceArchivesTable = pgTable("issuance_archives", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  totalQuantity: integer("total_quantity").notNull(),
  totalPrice: doublePrecision("total_price").notNull(),
  entries: jsonb("entries").$type<ArchivedEntry[]>().notNull(),
});

export const insertIssuanceItemSchema = createInsertSchema(issuanceItemsTable).omit({ createdAt: true });
export const insertIssuanceEntrySchema = createInsertSchema(issuanceEntriesTable).omit({ issuedAt: true });
export const insertIssuanceArchiveSchema = createInsertSchema(issuanceArchivesTable).omit({ archivedAt: true });

export type IssuanceItem = typeof issuanceItemsTable.$inferSelect;
export type IssuanceEntry = typeof issuanceEntriesTable.$inferSelect;
export type IssuanceArchive = typeof issuanceArchivesTable.$inferSelect;
export type InsertIssuanceItem = z.infer<typeof insertIssuanceItemSchema>;
export type InsertIssuanceEntry = z.infer<typeof insertIssuanceEntrySchema>;
export type InsertIssuanceArchive = z.infer<typeof insertIssuanceArchiveSchema>;