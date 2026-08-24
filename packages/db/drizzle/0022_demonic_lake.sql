CREATE TABLE "food_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id" text NOT NULL,
	"name_tr" text NOT NULL,
	"normalized_name" text NOT NULL,
	"amount_grams" numeric(10, 2),
	"measure" text,
	"source_line" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_ingredients" ADD CONSTRAINT "food_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_ingredients_food_id_idx" ON "food_ingredients" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "food_ingredients_normalized_name_idx" ON "food_ingredients" USING btree ("normalized_name");