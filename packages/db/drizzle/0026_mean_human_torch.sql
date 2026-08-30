CREATE TABLE "medication_substance_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"medication_substance_id" text NOT NULL,
	"system" text DEFAULT 'RXNORM' NOT NULL,
	"external_id" text NOT NULL,
	"mapping_status" text DEFAULT 'candidate' NOT NULL,
	"match_method" text NOT NULL,
	"confidence" double precision,
	"matched_term" text,
	"external_term_type" text,
	"source_version" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_substance_mappings_system_check" CHECK ("medication_substance_mappings"."system" in ('RXNORM')),
	CONSTRAINT "medication_substance_mappings_status_check" CHECK ("medication_substance_mappings"."mapping_status" in ('candidate', 'reviewed', 'verified', 'ambiguous', 'rejected', 'unmapped')),
	CONSTRAINT "medication_substance_mappings_method_check" CHECK ("medication_substance_mappings"."match_method" in ('lexical_exact', 'normalized_exact', 'token_exact', 'atc_bridge', 'fuzzy', 'manual')),
	CONSTRAINT "medication_substance_mappings_confidence_check" CHECK ("medication_substance_mappings"."confidence" is null or ("medication_substance_mappings"."confidence" >= 0 and "medication_substance_mappings"."confidence" <= 1)),
	CONSTRAINT "medication_substance_mappings_review_check" CHECK ("medication_substance_mappings"."mapping_status" not in ('reviewed', 'verified') or ("medication_substance_mappings"."reviewed_by" is not null and "medication_substance_mappings"."reviewed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "medication_substance_mappings" ADD CONSTRAINT "medication_substance_mappings_medication_substance_id_medication_substances_id_fk" FOREIGN KEY ("medication_substance_id") REFERENCES "public"."medication_substances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medication_substance_mappings_unique_idx" ON "medication_substance_mappings" USING btree ("medication_substance_id","system","external_id");--> statement-breakpoint
CREATE INDEX "medication_substance_mappings_external_idx" ON "medication_substance_mappings" USING btree ("system","external_id");--> statement-breakpoint
CREATE INDEX "medication_substance_mappings_status_idx" ON "medication_substance_mappings" USING btree ("mapping_status");
