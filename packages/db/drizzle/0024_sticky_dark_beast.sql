CREATE TABLE "client_conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"condition_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"diagnosed_at" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_medications" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"medication_product_id" text,
	"medication_substance_id" text,
	"custom_name" text,
	"dose" text,
	"dose_unit" text,
	"frequency" text,
	"route" text,
	"started_at" date,
	"ended_at" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_medications_selection_check" CHECK ("client_medications"."medication_product_id" is not null or "client_medications"."medication_substance_id" is not null or "client_medications"."custom_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "clinical_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"license" text,
	"citation" text,
	"url" text,
	"reuse_status" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"condition_id" text NOT NULL,
	"alias" text NOT NULL,
	"language" text NOT NULL,
	"alias_type" text NOT NULL,
	"source_id" text NOT NULL,
	"translation_status" text,
	"search_normalized" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"condition_id" text NOT NULL,
	"category_code" text NOT NULL,
	"category_en" text,
	"category_tr" text,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_crosswalks" (
	"id" text PRIMARY KEY NOT NULL,
	"condition_id" text NOT NULL,
	"target_system" text NOT NULL,
	"target_id" text NOT NULL,
	"mapping_status" text NOT NULL,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_external_ids" (
	"id" text PRIMARY KEY NOT NULL,
	"condition_id" text NOT NULL,
	"system" text NOT NULL,
	"external_id" text NOT NULL,
	"mapping_type" text DEFAULT 'xref' NOT NULL,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_parents" (
	"child_condition_id" text NOT NULL,
	"parent_condition_id" text NOT NULL,
	"relation_type" text DEFAULT 'is_a' NOT NULL,
	"source_id" text NOT NULL,
	"source_distance" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "condition_parents_child_condition_id_parent_condition_id_relation_type_source_id_pk" PRIMARY KEY("child_condition_id","parent_condition_id","relation_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"primary_source_id" text NOT NULL,
	"source_code" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"definition_en" text,
	"definition_tr" text,
	"semantic_type" text,
	"root_category" text,
	"is_neoplasm" boolean DEFAULT false NOT NULL,
	"is_supplemental_condition" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_ui_ready" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT true NOT NULL,
	"translation_status" text,
	"translation_confidence" double precision,
	"translation_display_source" text,
	"is_diet_relevant" boolean,
	"diet_relevance_status" text DEFAULT 'not_curated' NOT NULL,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_product_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"medication_product_id" text NOT NULL,
	"alias" text NOT NULL,
	"alias_type" text NOT NULL,
	"source_id" text NOT NULL,
	"search_normalized" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_product_substances" (
	"medication_product_id" text NOT NULL,
	"medication_substance_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "medication_product_substances_medication_product_id_medication_substance_id_relation_type_pk" PRIMARY KEY("medication_product_id","medication_substance_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "medication_products" (
	"id" text PRIMARY KEY NOT NULL,
	"product_type" text NOT NULL,
	"name" text NOT NULL,
	"barcode" text,
	"company_name" text,
	"active_ingredient_raw" text,
	"atc_code" text,
	"atc_name" text,
	"license_date" date,
	"license_number" text,
	"permit_date" date,
	"permit_number" text,
	"suspension_code" text,
	"suspension_date" date,
	"prescription_type" text,
	"erx_status" text,
	"erx_description" text,
	"erx_listed_date" date,
	"is_selectable" boolean DEFAULT true NOT NULL,
	"search_text" text NOT NULL,
	"source_id" text NOT NULL,
	"source_row" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_substance_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"medication_substance_id" text NOT NULL,
	"alias" text NOT NULL,
	"alias_type" text NOT NULL,
	"source_id" text NOT NULL,
	"search_normalized" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_substances" (
	"id" text PRIMARY KEY NOT NULL,
	"name_tr" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_combination" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"search_text" text NOT NULL,
	"source_id" text NOT NULL,
	"mapping_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_conditions" ADD CONSTRAINT "client_conditions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_conditions" ADD CONSTRAINT "client_conditions_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_medications" ADD CONSTRAINT "client_medications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_medications" ADD CONSTRAINT "client_medications_medication_product_id_medication_products_id_fk" FOREIGN KEY ("medication_product_id") REFERENCES "public"."medication_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_medications" ADD CONSTRAINT "client_medications_medication_substance_id_medication_substances_id_fk" FOREIGN KEY ("medication_substance_id") REFERENCES "public"."medication_substances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_aliases" ADD CONSTRAINT "condition_aliases_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_aliases" ADD CONSTRAINT "condition_aliases_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_categories" ADD CONSTRAINT "condition_categories_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_categories" ADD CONSTRAINT "condition_categories_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_crosswalks" ADD CONSTRAINT "condition_crosswalks_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_crosswalks" ADD CONSTRAINT "condition_crosswalks_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_external_ids" ADD CONSTRAINT "condition_external_ids_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_external_ids" ADD CONSTRAINT "condition_external_ids_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_parents" ADD CONSTRAINT "condition_parents_child_condition_id_conditions_id_fk" FOREIGN KEY ("child_condition_id") REFERENCES "public"."conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_parents" ADD CONSTRAINT "condition_parents_parent_condition_id_conditions_id_fk" FOREIGN KEY ("parent_condition_id") REFERENCES "public"."conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_parents" ADD CONSTRAINT "condition_parents_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_primary_source_id_clinical_sources_id_fk" FOREIGN KEY ("primary_source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_product_aliases" ADD CONSTRAINT "medication_product_aliases_medication_product_id_medication_products_id_fk" FOREIGN KEY ("medication_product_id") REFERENCES "public"."medication_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_product_aliases" ADD CONSTRAINT "medication_product_aliases_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_product_substances" ADD CONSTRAINT "medication_product_substances_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_product_substances" ADD CONSTRAINT "med_product_substances_product_fk" FOREIGN KEY ("medication_product_id") REFERENCES "public"."medication_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_product_substances" ADD CONSTRAINT "med_product_substances_substance_fk" FOREIGN KEY ("medication_substance_id") REFERENCES "public"."medication_substances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_products" ADD CONSTRAINT "medication_products_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_substance_aliases" ADD CONSTRAINT "medication_substance_aliases_medication_substance_id_medication_substances_id_fk" FOREIGN KEY ("medication_substance_id") REFERENCES "public"."medication_substances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_substance_aliases" ADD CONSTRAINT "medication_substance_aliases_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_substances" ADD CONSTRAINT "medication_substances_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_conditions_client_condition_idx" ON "client_conditions" USING btree ("client_id","condition_id");--> statement-breakpoint
CREATE INDEX "client_conditions_condition_idx" ON "client_conditions" USING btree ("condition_id");--> statement-breakpoint
CREATE INDEX "client_medications_client_active_idx" ON "client_medications" USING btree ("client_id","is_active");--> statement-breakpoint
CREATE INDEX "client_medications_product_idx" ON "client_medications" USING btree ("medication_product_id");--> statement-breakpoint
CREATE INDEX "client_medications_substance_idx" ON "client_medications" USING btree ("medication_substance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_sources_code_idx" ON "clinical_sources" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "condition_aliases_condition_lang_search_idx" ON "condition_aliases" USING btree ("condition_id","language","search_normalized");--> statement-breakpoint
CREATE INDEX "condition_aliases_search_idx" ON "condition_aliases" USING btree ("search_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "condition_categories_unique_idx" ON "condition_categories" USING btree ("condition_id","source_id","category_code");--> statement-breakpoint
CREATE INDEX "condition_categories_code_idx" ON "condition_categories" USING btree ("category_code");--> statement-breakpoint
CREATE UNIQUE INDEX "condition_crosswalks_unique_idx" ON "condition_crosswalks" USING btree ("condition_id","target_system","target_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "condition_external_ids_unique_idx" ON "condition_external_ids" USING btree ("condition_id","system","external_id");--> statement-breakpoint
CREATE INDEX "condition_external_ids_lookup_idx" ON "condition_external_ids" USING btree ("system","external_id");--> statement-breakpoint
CREATE INDEX "condition_parents_child_idx" ON "condition_parents" USING btree ("child_condition_id");--> statement-breakpoint
CREATE INDEX "condition_parents_parent_idx" ON "condition_parents" USING btree ("parent_condition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conditions_source_code_idx" ON "conditions" USING btree ("primary_source_id","source_code");--> statement-breakpoint
CREATE INDEX "conditions_active_name_tr_idx" ON "conditions" USING btree ("is_active","name_tr");--> statement-breakpoint
CREATE INDEX "conditions_neoplasm_idx" ON "conditions" USING btree ("is_neoplasm","is_active");--> statement-breakpoint
CREATE INDEX "conditions_ui_ready_idx" ON "conditions" USING btree ("is_ui_ready","needs_review");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_product_alias_unique_idx" ON "medication_product_aliases" USING btree ("medication_product_id","search_normalized","source_id");--> statement-breakpoint
CREATE INDEX "medication_product_substances_substance_idx" ON "medication_product_substances" USING btree ("medication_substance_id");--> statement-breakpoint
CREATE INDEX "medication_products_barcode_idx" ON "medication_products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "medication_products_selectable_name_idx" ON "medication_products" USING btree ("is_selectable","name");--> statement-breakpoint
CREATE INDEX "medication_products_atc_idx" ON "medication_products" USING btree ("atc_code");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_substance_alias_unique_idx" ON "medication_substance_aliases" USING btree ("medication_substance_id","search_normalized","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_substances_normalized_name_idx" ON "medication_substances" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "medication_substances_name_tr_idx" ON "medication_substances" USING btree ("name_tr");