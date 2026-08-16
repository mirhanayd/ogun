CREATE TYPE "public"."client_sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('aktif', 'pasif', 'arşiv');--> statement-breakpoint
CREATE TABLE "client_health" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"conditions" jsonb,
	"medications" jsonb,
	"allergies" jsonb,
	"intolerances" jsonb,
	"surgeries" text,
	"family_history" text,
	"smoking_status" text,
	"alcohol_use" text,
	"sleep_hours" integer,
	"bowel_habits" text,
	"water_intake_ml" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "first_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "last_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sex" "client_sex";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "occupation" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "referral_source" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "status" "client_status" DEFAULT 'aktif' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "assigned_dietitian_id" text;--> statement-breakpoint
ALTER TABLE "client_health" ADD CONSTRAINT "client_health_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_health_client_id_idx" ON "client_health" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_dietitian_id_users_id_fk" FOREIGN KEY ("assigned_dietitian_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_clinic_id_deleted_at_idx" ON "clients" USING btree ("clinic_id","deleted_at");--> statement-breakpoint
CREATE INDEX "clients_clinic_id_status_idx" ON "clients" USING btree ("clinic_id","status");--> statement-breakpoint
CREATE INDEX "clients_clinic_id_assigned_dietitian_id_idx" ON "clients" USING btree ("clinic_id","assigned_dietitian_id");