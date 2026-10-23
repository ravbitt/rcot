ALTER TABLE "share" ALTER COLUMN "model_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "share" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_folder_id_index" ON "share" USING btree ("folder_id");--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_target" CHECK (num_nonnulls(model_id, folder_id) = 1);