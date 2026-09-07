CREATE TABLE "clinical_review_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"assignment_role" text NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "clinical_review_assignments_role_check" CHECK ("clinical_review_assignments"."assignment_role" in ('primary', 'secondary', 'co_review')),
	CONSTRAINT "clinical_review_assignments_status_check" CHECK ("clinical_review_assignments"."status" in ('assigned', 'in_progress', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "clinical_review_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text,
	"actor_user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"compact_change_summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_review_audit_log_event_type_check" CHECK ("clinical_review_audit_log"."event_type" in ('task_created', 'task_assigned', 'review_started', 'decision_saved', 'decision_changed', 'needs_evidence', 'approval_completed', 'source_changed', 'ready_to_publish', 'published', 'reviewer_verified', 'reviewer_suspended'))
);
--> statement-breakpoint
CREATE TABLE "clinical_review_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"decision" text NOT NULL,
	"severity" text,
	"evidence_strength" text,
	"approved_target_key" text,
	"approved_action" text,
	"title_tr" text,
	"clinical_effect_tr" text,
	"mechanism_tr" text,
	"recommendation_tr" text,
	"attribution_confirmed" boolean,
	"reject_reason" text,
	"review_note" text,
	"candidate_semantic_hash" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_review_decisions_decision_check" CHECK ("clinical_review_decisions"."decision" in ('approve', 'reject', 'defer', 'needs_more_evidence')),
	CONSTRAINT "clinical_review_decisions_severity_check" CHECK ("clinical_review_decisions"."severity" is null or "clinical_review_decisions"."severity" in ('info', 'low', 'moderate', 'high', 'critical')),
	CONSTRAINT "clinical_review_decisions_evidence_strength_check" CHECK ("clinical_review_decisions"."evidence_strength" is null or "clinical_review_decisions"."evidence_strength" in ('strong', 'moderate', 'limited', 'expert_consensus', 'unknown')),
	CONSTRAINT "clinical_review_decisions_action_check" CHECK ("clinical_review_decisions"."approved_action" is null or "clinical_review_decisions"."approved_action" in ('avoid', 'limit', 'caution', 'monitor', 'consistency', 'separate_timing', 'take_with_food', 'take_without_food', 'avoid_alcohol', 'individualize')),
	CONSTRAINT "clinical_review_decisions_reject_reason_check" CHECK ("clinical_review_decisions"."reject_reason" is null or "clinical_review_decisions"."reject_reason" in ('false_positive', 'wrong_subject', 'wrong_target', 'wrong_action', 'non_clinical_instruction', 'duplicate', 'source_problem', 'other'))
);
--> statement-breakpoint
CREATE TABLE "clinical_review_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" text DEFAULT 'openfda' NOT NULL,
	"candidate_id" text NOT NULL,
	"candidate_semantic_hash" text NOT NULL,
	"subject_type" text NOT NULL,
	"medication_substance_id" text,
	"condition_id" text,
	"target_type" text NOT NULL,
	"target_key" text NOT NULL,
	"action" text NOT NULL,
	"candidate_confidence" text NOT NULL,
	"ingredient_attribution" text,
	"review_priority" text NOT NULL,
	"required_capability" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"artifact_locator" text NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"source_document_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_review_tasks_subject_check" CHECK (num_nonnulls("clinical_review_tasks"."medication_substance_id", "clinical_review_tasks"."condition_id") = 1),
	CONSTRAINT "clinical_review_tasks_subject_type_check" CHECK ("clinical_review_tasks"."subject_type" in ('medication', 'condition')),
	CONSTRAINT "clinical_review_tasks_status_check" CHECK ("clinical_review_tasks"."status" in ('pending', 'assigned', 'in_review', 'needs_more_evidence', 'approved', 'rejected', 'deferred', 'ready_to_publish', 'published', 'source_changed')),
	CONSTRAINT "clinical_review_tasks_priority_check" CHECK ("clinical_review_tasks"."review_priority" in ('P1', 'P2', 'P3', 'P4', 'P5')),
	CONSTRAINT "clinical_review_tasks_confidence_check" CHECK ("clinical_review_tasks"."candidate_confidence" in ('high', 'medium', 'low')),
	CONSTRAINT "clinical_review_tasks_target_type_check" CHECK ("clinical_review_tasks"."target_type" in ('nutrient', 'food_component', 'food', 'food_group', 'supplement', 'alcohol', 'meal_timing')),
	CONSTRAINT "clinical_review_tasks_action_check" CHECK ("clinical_review_tasks"."action" in ('avoid', 'limit', 'caution', 'monitor', 'consistency', 'separate_timing', 'take_with_food', 'take_without_food', 'avoid_alcohol', 'individualize')),
	CONSTRAINT "clinical_review_tasks_version_check" CHECK ("clinical_review_tasks"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "clinical_reviewer_capabilities" (
	"reviewer_user_id" text NOT NULL,
	"capability" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_reviewer_capabilities_reviewer_user_id_capability_pk" PRIMARY KEY("reviewer_user_id","capability"),
	CONSTRAINT "clinical_reviewer_capability_check" CHECK ("clinical_reviewer_capabilities"."capability" in ('medication_food', 'medication_supplement', 'medication_timing', 'condition_nutrient', 'condition_food', 'oncology_medication', 'renal_nutrition', 'general_clinical'))
);
--> statement-breakpoint
CREATE TABLE "clinical_reviewer_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"professional_role" text NOT NULL,
	"specialty" text,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"can_publish" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_reviewer_role_check" CHECK ("clinical_reviewer_profiles"."professional_role" in ('pharmacist', 'dietitian', 'physician', 'clinical_admin')),
	CONSTRAINT "clinical_reviewer_status_check" CHECK ("clinical_reviewer_profiles"."verification_status" in ('pending', 'verified', 'suspended', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "clinical_review_assignments" ADD CONSTRAINT "clinical_review_assignments_task_id_clinical_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."clinical_review_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_assignments" ADD CONSTRAINT "clinical_review_assignments_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_assignments" ADD CONSTRAINT "clinical_review_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_audit_log" ADD CONSTRAINT "clinical_review_audit_log_task_id_clinical_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."clinical_review_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_audit_log" ADD CONSTRAINT "clinical_review_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_decisions" ADD CONSTRAINT "clinical_review_decisions_task_id_clinical_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."clinical_review_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_decisions" ADD CONSTRAINT "clinical_review_decisions_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_tasks" ADD CONSTRAINT "clinical_review_tasks_medication_substance_id_medication_substances_id_fk" FOREIGN KEY ("medication_substance_id") REFERENCES "public"."medication_substances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_review_tasks" ADD CONSTRAINT "clinical_review_tasks_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_capabilities" ADD CONSTRAINT "clinical_reviewer_capabilities_reviewer_user_id_clinical_reviewer_profiles_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."clinical_reviewer_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_profiles" ADD CONSTRAINT "clinical_reviewer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_profiles" ADD CONSTRAINT "clinical_reviewer_profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_review_assignments_task_user_idx" ON "clinical_review_assignments" USING btree ("task_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "clinical_review_assignments_user_status_idx" ON "clinical_review_assignments" USING btree ("reviewer_user_id","status");--> statement-breakpoint
CREATE INDEX "clinical_review_assignments_task_status_idx" ON "clinical_review_assignments" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "clinical_review_audit_log_task_idx" ON "clinical_review_audit_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "clinical_review_audit_log_actor_idx" ON "clinical_review_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "clinical_review_audit_log_created_idx" ON "clinical_review_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_review_decisions_task_user_draft_idx" ON "clinical_review_decisions" USING btree ("task_id","reviewer_user_id","is_draft");--> statement-breakpoint
CREATE INDEX "clinical_review_decisions_task_idx" ON "clinical_review_decisions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "clinical_review_decisions_reviewer_idx" ON "clinical_review_decisions" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "clinical_review_decisions_decision_idx" ON "clinical_review_decisions" USING btree ("decision");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_review_tasks_candidate_idx" ON "clinical_review_tasks" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "clinical_review_tasks_status_priority_idx" ON "clinical_review_tasks" USING btree ("status","review_priority");--> statement-breakpoint
CREATE INDEX "clinical_review_tasks_cap_status_idx" ON "clinical_review_tasks" USING btree ("required_capability","status");--> statement-breakpoint
CREATE INDEX "clinical_review_tasks_med_status_idx" ON "clinical_review_tasks" USING btree ("medication_substance_id","status");--> statement-breakpoint
CREATE INDEX "clinical_review_tasks_cond_status_idx" ON "clinical_review_tasks" USING btree ("condition_id","status");--> statement-breakpoint
CREATE INDEX "clinical_review_tasks_semantic_hash_idx" ON "clinical_review_tasks" USING btree ("candidate_semantic_hash");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_capabilities_cap_idx" ON "clinical_reviewer_capabilities" USING btree ("capability");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_role_status_idx" ON "clinical_reviewer_profiles" USING btree ("professional_role","verification_status","is_active");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_status_idx" ON "clinical_reviewer_profiles" USING btree ("verification_status");