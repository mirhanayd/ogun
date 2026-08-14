CREATE TYPE "public"."exchange_group_code" AS ENUM('EKMEK', 'ET', 'SUT', 'MEYVE', 'SEBZE', 'YAG');--> statement-breakpoint
CREATE TABLE "exchange_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"code" "exchange_group_code" NOT NULL,
	"name_tr" text NOT NULL,
	"ref_kcal" numeric(8, 2) NOT NULL,
	"ref_protein" numeric(8, 2) NOT NULL,
	"ref_carb" numeric(8, 2) NOT NULL,
	"ref_fat" numeric(8, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "food_exchanges" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id" text NOT NULL,
	"group_id" text NOT NULL,
	"grams_per_exchange" numeric(8, 2) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"food_id" text NOT NULL,
	"amount_grams" numeric(10, 2) NOT NULL,
	"portion_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text,
	"name_tr" text NOT NULL,
	"servings" integer DEFAULT 1 NOT NULL,
	"cooking_method" text,
	"total_yield_grams" numeric(10, 2),
	"instructions" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_exchanges" ADD CONSTRAINT "food_exchanges_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_exchanges" ADD CONSTRAINT "food_exchanges_group_id_exchange_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."exchange_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_portion_id_food_portions_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."food_portions"("id") ON DELETE no action ON UPDATE no action;