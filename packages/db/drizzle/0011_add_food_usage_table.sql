CREATE TABLE "food_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"food_id" text NOT NULL,
	"use_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_usage" ADD CONSTRAINT "food_usage_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_usage" ADD CONSTRAINT "food_usage_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "food_usage_clinic_id_food_id_idx" ON "food_usage" USING btree ("clinic_id","food_id");--> statement-breakpoint
CREATE INDEX "food_usage_clinic_id_last_used_at_idx" ON "food_usage" USING btree ("clinic_id","last_used_at");--> statement-breakpoint
CREATE INDEX "food_usage_clinic_id_use_count_idx" ON "food_usage" USING btree ("clinic_id","use_count");