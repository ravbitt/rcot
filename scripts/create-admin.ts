// Cuenta del administrador del panel.
//
// Uso local: pnpm admin:create --email tu@correo.cl --name "Nombre"   (la contraseña se pide por consola)
//
// Al iniciar el contenedor: --sync con ADMIN_EMAIL y ADMIN_PASSWORD. La variable de entorno es la fuente
// de verdad: si la cuenta no existe se crea, y si existe con otra contraseña se actualiza (y se cierran
// sus sesiones). Así, para cambiar la contraseña basta con editar ADMIN_PASSWORD en Coolify y redesplegar.

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { account, session, user } from "../src/db/auth-schema";
import { createAuth } from "../src/lib/auth";

const MIN_LENGTH = 10;

async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  // Oculta lo que se escribe
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.startsWith(question)) write.call(rl, s);
  };
  const answer = await rl.question(question);
  rl.close();
  stdout.write("\n");
  return answer;
}

/** Crea la cuenta o, si ya existe, deja su contraseña igual a `password`. */
async function upsertAdmin(email: string, name: string, password: string) {
  const auth = createAuth({ cli: true });
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())).limit(1);
  if (!existing) {
    const res = await auth.api.signUpEmail({ body: { email, name, password } });
    console.log(`✓ Administrador creado: ${res.user.email}.`);
    return;
  }
  const ctx = await auth.$context;
  const [cred] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")))
    .limit(1);
  if (cred?.password && (await ctx.password.verify({ password, hash: cred.password }))) {
    console.log(`· Administrador ${email}: contraseña al día.`);
    return;
  }
  const hash = await ctx.password.hash(password);
  if (cred) await db.update(account).set({ password: hash }).where(eq(account.id, cred.id));
  else
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId: existing.id,
      accountId: existing.id,
      providerId: "credential",
      password: hash,
    });
  await db.delete(session).where(eq(session.userId, existing.id));
  console.log(`✓ Administrador ${email}: contraseña actualizada desde ADMIN_PASSWORD (sesiones cerradas).`);
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, sync: { type: "boolean" } } });
  const email = (values.email ?? process.env.ADMIN_EMAIL ?? "").trim();
  const name = values.name ?? process.env.ADMIN_NAME ?? "Administrador";

  if (values.sync) {
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!email || !password) {
      console.log("· Sin ADMIN_EMAIL/ADMIN_PASSWORD: no se revisa la cuenta del administrador.");
      return;
    }
    if (password.length < MIN_LENGTH) {
      // No se detiene el arranque: el sitio sigue funcionando, pero se avisa en el log
      console.error(`✗ ADMIN_PASSWORD tiene menos de ${MIN_LENGTH} caracteres: no se aplica.`);
      return;
    }
    await upsertAdmin(email, name, password);
    return;
  }

  if (!email) {
    console.error('Uso: pnpm admin:create --email correo@ejemplo.cl --name "Nombre"   (en el contenedor: node scripts/create-admin.mjs ...)');
    process.exitCode = 1;
    return;
  }
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden(`Contraseña (mín. ${MIN_LENGTH} caracteres): `));
  if (!process.env.ADMIN_PASSWORD) {
    const again = await askHidden("Repite la contraseña: ");
    if (again !== password) {
      console.error("Las contraseñas no coinciden.");
      process.exitCode = 1;
      return;
    }
  }
  await upsertAdmin(email, name, password);
}

main()
  .catch((err) => {
    console.error("No se pudo preparar el administrador:", err?.body?.message ?? err?.message ?? err);
    // En el arranque del contenedor no se detiene el servidor por esto
    if (!process.argv.includes("--sync")) process.exitCode = 1;
  })
  .finally(() => pool.end());
