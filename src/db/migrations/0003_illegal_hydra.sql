ALTER TABLE "dimension" ADD COLUMN "kind" text DEFAULT 'linear' NOT NULL;--> statement-breakpoint
ALTER TABLE "dimension" ADD COLUMN "c" jsonb;