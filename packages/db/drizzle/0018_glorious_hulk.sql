CREATE TYPE "public"."payment_provider_name" AS ENUM('manuel', 'iyzico', 'paytr');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('başlangıç', 'klinik', 'kurumsal');--> statement-breakpoint
CREATE TYPE "public"."sms_log_status" AS ENUM('gönderildi', 'başarısız', 'rıza_yok');--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"subscription_id" text,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"plan_code" "subscription_plan" NOT NULL,
	"provider" "payment_provider_name" DEFAULT 'manuel' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"client_id" text NOT NULL,
	"appointment_id" text,
	"phone" text NOT NULL,
	"message" text NOT NULL,
	"status" "sms_log_status" NOT NULL,
	"provider" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "sms_reminder_template" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_events_clinic_id_occurred_at_idx" ON "subscription_events" USING btree ("clinic_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_clinic_id_idx" ON "subscriptions" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "sms_logs_clinic_id_sent_at_idx" ON "sms_logs" USING btree ("clinic_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sms_logs_appointment_id_idx" ON "sms_logs" USING btree ("appointment_id");