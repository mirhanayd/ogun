CREATE TYPE "public"."plan_meal_type" AS ENUM('kahvaltı', 'ara1', 'öğle', 'ara2', 'akşam', 'gece');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('taslak', 'aktif', 'arşiv');--> statement-breakpoint
CREATE TYPE "public"."plan_template_category" AS ENUM('diyabet', 'kilo_verme', 'kilo_alma', 'gebelik', 'sporcu', 'çölyak', 'böbrek', 'karaciğer', 'genel');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('günlük', 'haftalık', 'değişim');--> statement-breakpoint
CREATE TABLE "diet_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"client_id" text,
	"name" text NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"target_kcal" integer,
	"target_macros" jsonb,
	"plan_type" "plan_type" DEFAULT 'günlük' NOT NULL,
	"status" "plan_status" DEFAULT 'taslak' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"template_category" "plan_template_category",
	"created_by" text,
	"notes" text,
	"general_instructions" text,
	"computed_totals" jsonb,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_days" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"day_label" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "plan_item_alternatives" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"food_id" text,
	"recipe_id" text,
	"free_text" text,
	"amount" numeric(10, 2) NOT NULL,
	"portion_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plan_item_alternatives_exactly_one_source_check" CHECK ((
    (CASE WHEN food_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN recipe_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN free_text IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1)
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"meal_id" text NOT NULL,
	"food_id" text,
	"recipe_id" text,
	"free_text" text,
	"amount" numeric(10, 2) NOT NULL,
	"portion_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "plan_items_exactly_one_source_check" CHECK ((
    (CASE WHEN food_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN recipe_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN free_text IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1)
);
--> statement-breakpoint
CREATE TABLE "plan_meals" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"meal_type" "plan_meal_type" NOT NULL,
	"time" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_id_diet_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."diet_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item_alternatives" ADD CONSTRAINT "plan_item_alternatives_item_id_plan_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item_alternatives" ADD CONSTRAINT "plan_item_alternatives_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item_alternatives" ADD CONSTRAINT "plan_item_alternatives_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item_alternatives" ADD CONSTRAINT "plan_item_alternatives_portion_id_food_portions_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."food_portions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_meal_id_plan_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."plan_meals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_portion_id_food_portions_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."food_portions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_meals" ADD CONSTRAINT "plan_meals_day_id_plan_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."plan_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diet_plans_clinic_id_client_id_idx" ON "diet_plans" USING btree ("clinic_id","client_id");--> statement-breakpoint
CREATE INDEX "diet_plans_clinic_id_is_template_idx" ON "diet_plans" USING btree ("clinic_id","is_template");--> statement-breakpoint
CREATE INDEX "diet_plans_clinic_id_status_idx" ON "diet_plans" USING btree ("clinic_id","status");--> statement-breakpoint
CREATE INDEX "plan_days_plan_id_day_number_idx" ON "plan_days" USING btree ("plan_id","day_number");--> statement-breakpoint
CREATE INDEX "plan_item_alternatives_item_id_sort_order_idx" ON "plan_item_alternatives" USING btree ("item_id","sort_order");--> statement-breakpoint
CREATE INDEX "plan_items_meal_id_sort_order_idx" ON "plan_items" USING btree ("meal_id","sort_order");--> statement-breakpoint
CREATE INDEX "plan_meals_day_id_sort_order_idx" ON "plan_meals" USING btree ("day_id","sort_order");