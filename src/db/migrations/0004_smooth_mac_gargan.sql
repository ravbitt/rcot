CREATE TABLE "material" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"kind" text DEFAULT 'tablero' NOT NULL,
	"thickness" real,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "materials" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "model_file_hash_index" ON "model" USING btree ("file_hash");--> statement-breakpoint
-- Catálogo inicial (se puede editar desde «Materiales» en el panel)
INSERT INTO "material" ("id", "name", "color", "kind", "thickness", "position") VALUES
  ('mat_pino', 'Pino', '#d9a35f', 'liston', NULL, 0),
  ('mat_mdf15', 'MDF 15', '#8fa8c8', 'tablero', 15, 1),
  ('mat_mdf25', 'MDF 25', '#5d7fa8', 'tablero', 25, 2),
  ('mat_terciado15', 'Terciado 15', '#c9b37e', 'tablero', 15, 3),
  ('mat_carton3', 'Cartón piedra 3', '#a9a9a3', 'lamina', 3, 4)
ON CONFLICT DO NOTHING;
