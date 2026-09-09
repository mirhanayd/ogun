CREATE TYPE "public"."catalog_editorial_status" AS ENUM('draft', 'in_review', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "food_catalog_events" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_platform_staff_id" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_catalog_events_type_check" CHECK ("food_catalog_events"."event_type" in ('created', 'general_updated', 'nutrients_updated', 'portions_updated', 'reference_added', 'submitted_for_review', 'returned_to_draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "food_source_references" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id" text NOT NULL,
	"title" text NOT NULL,
	"citation" text NOT NULL,
	"url" text,
	"note" text,
	"created_by_platform_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_source_references_title_check" CHECK (length(trim("food_source_references"."title")) > 0),
	CONSTRAINT "food_source_references_citation_check" CHECK (length(trim("food_source_references"."citation")) > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_catalog_events" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_platform_staff_id" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_catalog_events_type_check" CHECK ("recipe_catalog_events"."event_type" in ('created', 'updated', 'ingredients_updated', 'reference_added', 'submitted_for_review', 'returned_to_draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "recipe_source_references" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"title" text NOT NULL,
	"citation" text NOT NULL,
	"url" text,
	"note" text,
	"created_by_platform_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_source_references_title_check" CHECK (length(trim("recipe_source_references"."title")) > 0),
	CONSTRAINT "recipe_source_references_citation_check" CHECK (length(trim("recipe_source_references"."citation")) > 0)
);
--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "is_platform_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "editorial_status" "catalog_editorial_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "published_by_platform_staff_id" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "is_platform_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "editorial_status" "catalog_editorial_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "published_by_platform_staff_id" text;--> statement-breakpoint
ALTER TABLE "food_catalog_events" ADD CONSTRAINT "food_catalog_events_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_source_references" ADD CONSTRAINT "food_source_references_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_catalog_events" ADD CONSTRAINT "recipe_catalog_events_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_source_references" ADD CONSTRAINT "recipe_source_references_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_catalog_events_food_created_idx" ON "food_catalog_events" USING btree ("food_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "food_source_references_food_created_idx" ON "food_source_references" USING btree ("food_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recipe_catalog_events_recipe_created_idx" ON "recipe_catalog_events" USING btree ("recipe_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recipe_source_references_recipe_created_idx" ON "recipe_source_references" USING btree ("recipe_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "food_portions_one_default_idx" ON "food_portions" USING btree ("food_id") WHERE "food_portions"."is_default" = true;--> statement-breakpoint
CREATE INDEX "recipes_platform_status_updated_idx" ON "recipes" USING btree ("is_platform_managed","editorial_status","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "food_portions" ADD CONSTRAINT "food_portions_positive_grams_check" CHECK ("food_portions"."grams" > 0);--> statement-breakpoint
ALTER TABLE "food_portions" ADD CONSTRAINT "food_portions_nonempty_label_check" CHECK (length(trim("food_portions"."label")) > 0);--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_positive_grams_check" CHECK ("recipe_ingredients"."amount_grams" > 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_servings_positive_check" CHECK ("recipes"."servings" >= 1);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_yield_positive_check" CHECK ("recipes"."total_yield_grams" is null or "recipes"."total_yield_grams" > 0);