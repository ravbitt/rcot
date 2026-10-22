import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";

export const APP_NAME = "Cotas";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

/**
 * Orígenes en los que se confía además de BETTER_AUTH_URL.
 * - BETTER_AUTH_TRUSTED_ORIGINS: lista separada por comas.
 * - En desarrollo se acepta cualquier origen local, en cualquier puerto.
 */
function trustedOrigins(request?: Request) {
  const extra = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "development") {
    const origin = request?.headers.get("origin");
    if (origin && LOCAL_ORIGIN.test(origin)) extra.push(origin);
  }
  return extra;
}

/**
 * Hay un único administrador, así que el registro público está desactivado.
 * El script `pnpm admin:create` crea la cuenta con `cli: true` (registro habilitado, sin cookies de Next).
 * Los clientes no tienen cuenta: entran con un enlace de solo lectura (tabla `share`).
 */
export function createAuth({ cli = false } = {}) {
  return betterAuth({
    appName: APP_NAME,
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !cli,
      minPasswordLength: 10,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 días
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true },
    // Debe ir al final: permite fijar cookies desde Server Actions. Fuera de Next no aplica.
    plugins: cli ? [] : [nextCookies()],
  });
}

export const auth = createAuth();
export type Session = typeof auth.$Infer.Session;
