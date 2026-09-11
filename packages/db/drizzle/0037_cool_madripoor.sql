CREATE TYPE "public"."operational_finding_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."operational_finding_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."operational_job_status" AS ENUM('running', 'success', 'partial', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."operational_job_trigger" AS ENUM('cron', 'manual', 'test');--> statement-breakpoint
CREATE TYPE "public"."provider_webhook_receipt_status" AS ENUM('processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sms_reminder_delivery_status" AS ENUM('pending', 'processing', 'sent', 'failed_retryable', 'failed_terminal', 'skipped_no_consent', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TABLE "operational_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" "operational_finding_severity" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"clinic_id" text,
	"fingerprint" text NOT NULL,
	"status" "operational_finding_status" DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_job_leases" (
	"job_name" text PRIMARY KEY NOT NULL,
	"owner_token" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"trigger" "operational_job_trigger" NOT NULL,
	"status" "operational_job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"attempted_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_summary" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"provider_occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" "provider_webhook_receipt_status" DEFAULT 'processing' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"error_code" text,
	"error_summary" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sms_reminder_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"appointment_id" text NOT NULL,
	"client_id" text NOT NULL,
	"reminder_type" text DEFAULT 'appointment_24h' NOT NULL,
	"status" "sms_reminder_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider" text,
	"provider_message_id" text,
	"last_error_code" text,
	"last_error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "subscription_email_notifications_status_created_idx";--> statement-breakpoint
DROP INDEX "subscription_events_provider_event_id_idx";--> statement-breakpoint
DROP INDEX "support_email_notifications_status_idx";--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD COLUMN "terminal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD COLUMN "provider" "payment_provider_name";--> statement-breakpoint
ALTER TABLE "sms_logs" ADD COLUMN "reminder_delivery_id" text;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD COLUMN "terminal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operational_findings" ADD CONSTRAINT "operational_findings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_reminder_deliveries" ADD CONSTRAINT "sms_reminder_deliveries_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_reminder_deliveries" ADD CONSTRAINT "sms_reminder_deliveries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_reminder_deliveries" ADD CONSTRAINT "sms_reminder_deliveries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operational_findings_fingerprint_idx" ON "operational_findings" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "operational_findings_status_severity_idx" ON "operational_findings" USING btree ("status","severity","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operational_findings_clinic_idx" ON "operational_findings" USING btree ("clinic_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operational_job_runs_job_started_idx" ON "operational_job_runs" USING btree ("job_name","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operational_job_runs_status_started_idx" ON "operational_job_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_receipts_provider_event_idx" ON "provider_webhook_receipts" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "provider_webhook_receipts_status_received_idx" ON "provider_webhook_receipts" USING btree ("status","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sms_reminder_deliveries_identity_idx" ON "sms_reminder_deliveries" USING btree ("appointment_id","reminder_type");--> statement-breakpoint
CREATE INDEX "sms_reminder_deliveries_due_idx" ON "sms_reminder_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "sms_reminder_deliveries_clinic_idx" ON "sms_reminder_deliveries" USING btree ("clinic_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_reminder_delivery_id_sms_reminder_deliveries_id_fk" FOREIGN KEY ("reminder_delivery_id") REFERENCES "public"."sms_reminder_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_logs_reminder_delivery_idx" ON "sms_logs" USING btree ("reminder_delivery_id");--> statement-breakpoint
CREATE INDEX "subscription_email_notifications_status_created_idx" ON "subscription_email_notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_events_provider_event_id_idx" ON "subscription_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "support_email_notifications_status_idx" ON "support_email_notifications" USING btree ("status","next_attempt_at");