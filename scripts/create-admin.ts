// Crea la cuenta del administrador del panel.
// Uso: pnpm admin:create --email tu@correo.cl --name "Nombre"
// En el contenedor de producción: node scripts/create-admin.mjs --email ... --name "..."
// La contraseña se pide por consola (mínimo 10 caracteres).
// Al iniciar el contenedor: --if-none con ADMIN_EMAIL, ADMIN_NAME y ADMIN_PASSWORD crea la cuenta solo si no hay ninguna.

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { db, pool } from "../src/db";
import { user } from "../src/db/auth-schema";
import { createAuth } from "../src/lib/auth";

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

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, "if-none": { type: "boolean" } } });
  values.email ??= process.env.ADMIN_EMAIL;
  values.name ??= process.env.ADMIN_NAME ?? "Administrador";
  if (values["if-none"]) {
    const [existing] = await db.select({ id: user.id }).from(user).limit(1);
    if (existing) {
      console.log("· Ya existe un administrador: no se crea otro.");
      return;
    }
    if (!values.email || !process.env.ADMIN_PASSWORD) {
      console.log("· Sin ADMIN_EMAIL/ADMIN_PASSWORD: no se crea el administrador automáticamente.");
      return;
    }
  }
  if (!values.email || !values.name) {
    console.error('Uso: pnpm admin:create --email correo@ejemplo.cl --name "Nombre"   (en el contenedor: node scripts/create-admin.mjs ...)');
    process.exitCode = 1;
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Contraseña (mín. 10 caracteres): "));
  if (!process.env.ADMIN_PASSWORD) {
    const again = await askHidden("Repite la contraseña: ");
    if (again !== password) {
      console.error("Las contraseñas no coinciden.");
      process.exitCode = 1;
      return;
    }
  }

  const auth = createAuth({ cli: true });
  const res = await auth.api.signUpEmail({
    body: { email: values.email, name: values.name, password },
  });
  console.log(`✓ Administrador creado: ${res.user.email}.`);
}

main()
  .catch((err) => {
    console.error("No se pudo crear el administrador:", err?.body?.message ?? err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
