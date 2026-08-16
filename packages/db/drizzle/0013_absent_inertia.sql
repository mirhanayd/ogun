CREATE TYPE "public"."plan_output_format" AS ENUM('besin_listesi', 'değişim_listesi');--> statement-breakpoint
ALTER TABLE "diet_plans" ADD COLUMN "output_format" "plan_output_format" DEFAULT 'besin_listesi' NOT NULL;--> statement-breakpoint
CREATE INDEX "food_exchanges_group_id_idx" ON "food_exchanges" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "food_exchanges_food_id_is_primary_idx" ON "food_exchanges" USING btree ("food_id","is_primary");