CREATE TABLE "food_links" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id_a" text NOT NULL,
	"food_id_b" text NOT NULL,
	"confidence" numeric(4, 3),
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_nutrients" DROP CONSTRAINT "food_nutrients_food_id_nutrient_id_pk";--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_food_id_nutrient_id_source_id_pk" PRIMARY KEY("food_id","nutrient_id","source_id");--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD COLUMN "is_preferred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "food_links" ADD CONSTRAINT "food_links_food_id_a_foods_id_fk" FOREIGN KEY ("food_id_a") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_links" ADD CONSTRAINT "food_links_food_id_b_foods_id_fk" FOREIGN KEY ("food_id_b") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "food_links_pair_idx" ON "food_links" USING btree ("food_id_a","food_id_b");