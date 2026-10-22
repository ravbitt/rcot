CREATE TABLE "folder" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "thumb_file" text;--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_folder_id_index" ON "model" USING btree ("folder_id");