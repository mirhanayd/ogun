CREATE TABLE "clinical_interaction_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"interaction_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_document_id" text NOT NULL,
	"source_version" text,
	"source_section" text NOT NULL,
	"source_locator" text NOT NULL,
	"evidence_summary" text,
	"source_hash" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"evidence_strength" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_interaction_evidence_strength_check" CHECK ("clinical_interaction_evidence"."evidence_strength" in ('strong', 'moderate', 'limited', 'expert_consensus', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "clinical_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"medication_substance_id" text,
	"condition_id" text,
	"target_type" text NOT NULL,
	"nutrient_id" text,
	"clinical_target_concept_id" text,
	"action" text NOT NULL,
	"severity" text NOT NULL,
	"evidence_strength" text NOT NULL,
	"timing_before_minutes" integer,
	"timing_after_minutes" integer,
	"title_tr" text,
	"clinical_effect_tr" text,
	"mechanism_tr" text,
	"recommendation_tr" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"source_candidate_id" text NOT NULL,
	"source_candidate_semantic_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_interactions_subject_check" CHECK (num_nonnulls("clinical_interactions"."medication_substance_id", "clinical_interactions"."condition_id") = 1),
	CONSTRAINT "clinical_interactions_target_check" CHECK ((
        "clinical_interactions"."nutrient_id" is not null
        and "clinical_interactions"."clinical_target_concept_id" is null
        and "clinical_interactions"."target_type" in ('nutrient', 'food_component')
      ) or (
        "clinical_interactions"."nutrient_id" is null
        and "clinical_interactions"."clinical_target_concept_id" is not null
        and "clinical_interactions"."target_type" <> 'nutrient'
      )),
	CONSTRAINT "clinical_interactions_target_type_check" CHECK ("clinical_interactions"."target_type" in ('nutrient', 'food_component', 'food', 'food_group', 'supplement', 'alcohol', 'meal_timing')),
	CONSTRAINT "clinical_interactions_action_check" CHECK ("clinical_interactions"."action" in ('avoid', 'limit', 'caution', 'monitor', 'consistency', 'separate_timing', 'take_with_food', 'take_without_food', 'avoid_alcohol', 'individualize')),
	CONSTRAINT "clinical_interactions_severity_check" CHECK ("clinical_interactions"."severity" in ('info', 'low', 'moderate', 'high', 'critical')),
	CONSTRAINT "clinical_interactions_evidence_strength_check" CHECK ("clinical_interactions"."evidence_strength" in ('strong', 'moderate', 'limited', 'expert_consensus', 'unknown')),
	CONSTRAINT "clinical_interactions_status_check" CHECK ("clinical_interactions"."status" in ('draft', 'published', 'superseded', 'retired')),
	CONSTRAINT "clinical_interactions_review_status_check" CHECK ("clinical_interactions"."review_status" in ('pending', 'approved', 'rejected', 'needs_more_evidence')),
	CONSTRAINT "clinical_interactions_review_actor_check" CHECK ("clinical_interactions"."reviewed_by" is null or lower(trim("clinical_interactions"."reviewed_by")) not in ('ai', 'agent', 'system')),
	CONSTRAINT "clinical_interactions_publish_check" CHECK ("clinical_interactions"."status" <> 'published' or (
        "clinical_interactions"."review_status" = 'approved'
        and "clinical_interactions"."reviewed_by" is not null
        and "clinical_interactions"."reviewed_at" is not null
      )),
	CONSTRAINT "clinical_interactions_timing_check" CHECK (("clinical_interactions"."timing_before_minutes" is null or "clinical_interactions"."timing_before_minutes" >= 0)
        and ("clinical_interactions"."timing_after_minutes" is null or "clinical_interactions"."timing_after_minutes" >= 0)),
	CONSTRAINT "clinical_interactions_version_check" CHECK ("clinical_interactions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "clinical_target_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_target_concepts_type_check" CHECK ("clinical_target_concepts"."type" in ('food_component', 'food', 'food_group', 'supplement', 'alcohol', 'meal_timing'))
);
--> statement-breakpoint
ALTER TABLE "clinical_interaction_evidence" ADD CONSTRAINT "clinical_interaction_evidence_interaction_id_clinical_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."clinical_interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_interaction_evidence" ADD CONSTRAINT "clinical_interaction_evidence_source_id_clinical_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."clinical_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_interactions" ADD CONSTRAINT "clinical_interactions_medication_substance_id_medication_substances_id_fk" FOREIGN KEY ("medication_substance_id") REFERENCES "public"."medication_substances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_interactions" ADD CONSTRAINT "clinical_interactions_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_interactions" ADD CONSTRAINT "clinical_interactions_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_interactions" ADD CONSTRAINT "clinical_interactions_clinical_target_concept_id_clinical_target_concepts_id_fk" FOREIGN KEY ("clinical_target_concept_id") REFERENCES "public"."clinical_target_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_interaction_evidence_provenance_idx" ON "clinical_interaction_evidence" USING btree ("interaction_id","source_id","source_document_id","source_hash");--> statement-breakpoint
CREATE INDEX "clinical_interaction_evidence_interaction_idx" ON "clinical_interaction_evidence" USING btree ("interaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_interactions_source_candidate_idx" ON "clinical_interactions" USING btree ("source_candidate_id");--> statement-breakpoint
CREATE INDEX "clinical_interactions_medication_status_idx" ON "clinical_interactions" USING btree ("medication_substance_id","status","review_status");--> statement-breakpoint
CREATE INDEX "clinical_interactions_condition_status_idx" ON "clinical_interactions" USING btree ("condition_id","status","review_status");--> statement-breakpoint
CREATE INDEX "clinical_interactions_nutrient_idx" ON "clinical_interactions" USING btree ("nutrient_id");--> statement-breakpoint
CREATE INDEX "clinical_interactions_target_concept_idx" ON "clinical_interactions" USING btree ("clinical_target_concept_id");--> statement-breakpoint
CREATE INDEX "clinical_interactions_status_action_idx" ON "clinical_interactions" USING btree ("status","action");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_target_concepts_type_key_idx" ON "clinical_target_concepts" USING btree ("type","key");