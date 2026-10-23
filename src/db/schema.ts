// Tablas de la aplicación: modelos 3D, cotas, planos y enlaces para clientes.

import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { DimensionAxis, DimensionKind, SheetData, Vec3 } from "@/lib/types";

const ts = () => timestamp({ withTimezone: true });

/** Carpeta de un proyecto: agrupa modelos. Al borrarla, sus modelos quedan «sin carpeta». */
export const folder = pgTable("folder", {
  id: text().primaryKey(),
  name: text().notNull(),
  createdAt: ts().defaultNow().notNull(),
  updatedAt: ts()
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/** Modelo subido. El archivo original se guarda tal cual; `meshFile` es la malla convertida que usa el visor. */
export const model = pgTable(
  "model",
  {
    id: text().primaryKey(),
    folderId: text().references(() => folder.id, { onDelete: "set null" }),
    name: text().notNull(),
    notes: text().notNull().default(""),
    originalName: text().notNull(),
    format: text().$type<"step" | "iges" | "stl">().notNull(),
    file: text().notNull(),
    meshFile: text().notNull(),
    bytes: integer().notNull(),
    bodyCount: integer().notNull(),
    /** Caja envolvente en mm: [[minX, minY, minZ], [maxX, maxY, maxZ]] */
    bbox: jsonb().$type<[Vec3, Vec3]>().notNull(),
    /** Miniatura PNG (la genera el navegador al subir el modelo) */
    thumbFile: text(),
    createdAt: ts().defaultNow().notNull(),
    updatedAt: ts()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.folderId)],
);

/** Cota 3D entre dos puntos del modelo (mm). `offset` es un punto por donde pasa la línea de cota. */
export const dimension = pgTable(
  "dimension",
  {
    id: text().primaryKey(),
    modelId: text()
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
    a: jsonb().$type<Vec3>().notNull(),
    b: jsonb().$type<Vec3>().notNull(),
    offset: jsonb().$type<Vec3>().notNull(),
    axis: text().$type<DimensionAxis>().notNull().default("aligned"),
    /** linear (entre a y b), o radius / diameter / arc: arco que pasa por a, c y b; `offset` ubica la cota */
    kind: text().$type<DimensionKind>().notNull().default("linear"),
    c: jsonb().$type<Vec3>(),
    /** Texto opcional en vez del valor medido (p. ej. «alto asiento») */
    label: text(),
    createdAt: ts().defaultNow().notNull(),
  },
  (t) => [index().on(t.modelId)],
);

/** Plano (lámina) armado con vistas del modelo, cotas 2D y rótulo. */
export const sheet = pgTable(
  "sheet",
  {
    id: text().primaryKey(),
    modelId: text()
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
    name: text().notNull(),
    data: jsonb().$type<SheetData>().notNull(),
    position: integer().notNull().default(0),
    createdAt: ts().defaultNow().notNull(),
    updatedAt: ts()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.modelId)],
);

/**
 * Enlace de solo lectura para un cliente: de un modelo (`modelId`) o de un proyecto entero (`folderId`).
 * Quien tenga el token ve los modelos, sus cotas y (opcional) los planos.
 */
export const share = pgTable(
  "share",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    modelId: text().references(() => model.id, { onDelete: "cascade" }),
    folderId: text().references(() => folder.id, { onDelete: "cascade" }),
    label: text().notNull().default(""),
    showSheets: boolean().notNull().default(true),
    expiresAt: ts(),
    revokedAt: ts(),
    viewCount: integer().notNull().default(0),
    lastViewedAt: ts(),
    createdAt: ts().defaultNow().notNull(),
  },
  (t) => [index().on(t.modelId), index().on(t.folderId), check("share_target", sql`num_nonnulls(model_id, folder_id) = 1`)],
);
