CREATE TABLE "clinical_reviewer_invitation_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"task_id" text NOT NULL,
	"assignment_role" text DEFAULT 'primary' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"materialized_assignment_id" text,
	"created_by_platform_staff_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"materialized_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	CONSTRAINT "clinical_reviewer_invitation_assignments_role_check" CHECK ("clinical_reviewer_invitation_assignments"."assignment_role" in ('primary', 'secondary', 'co_review')),
	CONSTRAINT "clinical_reviewer_invitation_assignments_status_check" CHECK ("clinical_reviewer_invitation_assignments"."status" in ('pending', 'materialized', 'cancelled', 'invalidated'))
);
--> statement-breakpoint
CREATE TABLE "clinical_reviewer_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"name" text NOT NULL,
	"professional_role" text NOT NULL,
	"specialty" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"professional_verification_confirmed" boolean DEFAULT false NOT NULL,
	"verified_by_user_id" text,
	"professional_verified_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_platform_staff_id" text,
	"revoked_reason" text,
	"created_by_platform_staff_id" text NOT NULL,
	"email_delivery_status" text DEFAULT 'pending' NOT NULL,
	"email_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_email_attempt_at" timestamp with time zone,
	"last_email_sent_at" timestamp with time zone,
	"last_email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_reviewer_invitations_role_check" CHECK ("clinical_reviewer_invitations"."professional_role" in ('pharmacist', 'dietitian', 'physician', 'clinical_admin')),
	CONSTRAINT "clinical_reviewer_invitations_status_check" CHECK ("clinical_reviewer_invitations"."status" in ('pending', 'accepted', 'revoked')),
	CONSTRAINT "clinical_reviewer_invitations_email_status_check" CHECK ("clinical_reviewer_invitations"."email_delivery_status" in ('pending', 'sent', 'failed')),
	CONSTRAINT "clinical_reviewer_invitations_verification_check" CHECK (("clinical_reviewer_invitations"."professional_verification_confirmed" = false and "clinical_reviewer_invitations"."verified_by_user_id" is null and "clinical_reviewer_invitations"."professional_verified_at" is null) or ("clinical_reviewer_invitations"."professional_verification_confirmed" = true and "clinical_reviewer_invitations"."verified_by_user_id" is not null and "clinical_reviewer_invitations"."professional_verified_at" is not null)),
	CONSTRAINT "clinical_reviewer_invitations_revocation_check" CHECK ("clinical_reviewer_invitations"."status" <> 'revoked' or ("clinical_reviewer_invitations"."revoked_at" is not null and "clinical_reviewer_invitations"."revoked_by_platform_staff_id" is not null and length("clinical_reviewer_invitations"."revoked_reason") >= 3))
);
--> statement-breakpoint
ALTER TABLE "clinical_review_audit_log" DROP CONSTRAINT "clinical_review_audit_log_event_type_check";--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitation_assignments" ADD CONSTRAINT "clinical_reviewer_invitation_assignments_invitation_id_clinical_reviewer_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."clinical_reviewer_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitation_assignments" ADD CONSTRAINT "clinical_reviewer_invitation_assignments_task_id_clinical_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."clinical_review_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitation_assignments" ADD CONSTRAINT "clinical_reviewer_invitation_assignments_materialized_assignment_id_clinical_review_assignments_id_fk" FOREIGN KEY ("materialized_assignment_id") REFERENCES "public"."clinical_review_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitation_assignments" ADD CONSTRAINT "clinical_reviewer_invitation_assignments_created_by_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("created_by_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitations" ADD CONSTRAINT "clinical_reviewer_invitations_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitations" ADD CONSTRAINT "clinical_reviewer_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitations" ADD CONSTRAINT "clinical_reviewer_invitations_revoked_by_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("revoked_by_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_reviewer_invitations" ADD CONSTRAINT "clinical_reviewer_invitations_created_by_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("created_by_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_reviewer_invitation_assignments_invite_task_idx" ON "clinical_reviewer_invitation_assignments" USING btree ("invitation_id","task_id");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_invitation_assignments_invite_status_idx" ON "clinical_reviewer_invitation_assignments" USING btree ("invitation_id","status");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_invitation_assignments_task_idx" ON "clinical_reviewer_invitation_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_reviewer_invitations_token_hash_idx" ON "clinical_reviewer_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_invitations_email_idx" ON "clinical_reviewer_invitations" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "clinical_reviewer_invitations_status_expiry_idx" ON "clinical_reviewer_invitations" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "clinical_review_audit_log" ADD CONSTRAINT "clinical_review_audit_log_event_type_check" CHECK ("clinical_review_audit_log"."event_type" in ('task_created', 'task_assigned', 'task_assignment_cancelled', 'review_started', 'decision_saved', 'decision_changed', 'needs_evidence', 'approval_completed', 'source_changed', 'ready_to_publish', 'published', 'reviewer_invited', 'reviewer_invite_accepted', 'reviewer_verified', 'reviewer_rejected', 'reviewer_suspended', 'reviewer_reactivated', 'reviewer_capabilities_changed'));