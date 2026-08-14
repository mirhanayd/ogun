CREATE TYPE "public"."data_source_code" AS ENUM('BLS4', 'USDA_FDN', 'USDA_SR', 'TURKOMP', 'OFF', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."food_preparation" AS ENUM('çiğ', 'haşlanmış', 'kızartılmış', 'fırınlanmış', 'ızgara', 'buğulama');--> statement-breakpoint
CREATE TYPE "public"."nutrient_category" AS ENUM('makro', 'vitamin', 'mineral', 'yağ_asidi', 'amino_asit', 'diğer');--> statement-breakpoint
CREATE TYPE "public"."nutrient_unit" AS ENUM('g', 'mg', 'µg', 'kcal', 'kJ');--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"code" "data_source_code" NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"license" text,
	"citation" text,
	"priority" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "food_nutrients" (
	"food_id" text NOT NULL,
	"nutrient_id" text NOT NULL,
	"value_per_100g" numeric(12, 4) NOT NULL,
	"source_id" text NOT NULL,
	"is_imputed" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "food_nutrients_food_id_nutrient_id_pk" PRIMARY KEY("food_id","nutrient_id")
);
--> statement-breakpoint
CREATE TABLE "food_portions" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id" text NOT NULL,
	"label" text NOT NULL,
	"grams" numeric(10, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_code" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text,
	"search_text" text NOT NULL,
	"group_code" text,
	"group_name_tr" text,
	"preparation" "food_preparation",
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrients" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"unit" "nutrient_unit" NOT NULL,
	"category" "nutrient_category" NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "retention_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"nutrient_id" text NOT NULL,
	"method" text NOT NULL,
	"factor" numeric(6, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"food_id" text,
	"group_code" text,
	"method" text NOT NULL,
	"factor" numeric(6, 4) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_portions" ADD CONSTRAINT "food_portions_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_factors" ADD CONSTRAINT "retention_factors_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_factors" ADD CONSTRAINT "yield_factors_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_nutrients_nutrient_id_value_idx" ON "food_nutrients" USING btree ("nutrient_id","value_per_100g");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_id_source_code_idx" ON "foods" USING btree ("source_id","source_code");--> statement-breakpoint
CREATE INDEX "foods_search_text_trgm_idx" ON "foods" USING gin ("search_text" gin_trgm_ops);