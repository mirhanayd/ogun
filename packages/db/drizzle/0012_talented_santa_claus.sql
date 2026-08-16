CREATE TABLE "saved_meal_items" (
	"id" text PRIMARY KEY NOT NULL,
	"saved_meal_id" text NOT NULL,
	"food_id" text,
	"recipe_id" text,
	"free_text" text,
	"amount" numeric(10, 2) NOT NULL,
	"portion_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "saved_meal_items_exactly_one_source_check" CHECK ((
    (CASE WHEN food_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN recipe_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN free_text IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1)
);
--> statement-breakpoint
CREATE TABLE "saved_meals" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"meal_type" "plan_meal_type" NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diet_plans" ADD COLUMN "template_usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_saved_meal_id_saved_meals_id_fk" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_portion_id_food_portions_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."food_portions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_meal_items_saved_meal_id_sort_order_idx" ON "saved_meal_items" USING btree ("saved_meal_id","sort_order");--> statement-breakpoint
CREATE INDEX "saved_meals_clinic_id_idx" ON "saved_meals" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "saved_meals_clinic_id_meal_type_idx" ON "saved_meals" USING btree ("clinic_id","meal_type");