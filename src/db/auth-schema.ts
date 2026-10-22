// Tablas de Better Auth (administrador). Los nombres de export deben coincidir
// con los modelos de Better Auth: user, session, account, verification.

import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const ts = () => timestamp({ withTimezone: true });

export const user = pgTable("auth_user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: ts().defaultNow().notNull(),
  updatedAt: ts()
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "auth_session",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: ts().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: ts().defaultNow().notNull(),
    updatedAt: ts()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  "auth_account",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(),
    createdAt: ts().defaultNow().notNull(),
    updatedAt: ts()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  "auth_verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts().notNull(),
    createdAt: ts().defaultNow().notNull(),
    updatedAt: ts()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.identifier)],
);
