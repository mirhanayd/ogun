CREATE TYPE "public"."appointment_status" AS ENUM('planlandı', 'geldi', 'gelmedi', 'iptal', 'ertelendi');--> statement-breakpoint
CREATE TYPE "public"."appointment_type" AS ENUM('ilk_görüşme', 'kontrol', 'online', 'ölçüm');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"client_id" text NOT NULL,
	"dietitian_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"type" "appointment_type" DEFAULT 'kontrol' NOT NULL,
	"status" "appointment_status" DEFAULT 'planlandı' NOT NULL,
	"location" text,
	"notes" text,
	"package_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_holidays" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dietitian_id_users_id_fk" FOREIGN KEY ("dietitian_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_holidays" ADD CONSTRAINT "clinic_holidays_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_clinic_id_starts_at_idx" ON "appointments" USING btree ("clinic_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_dietitian_id_starts_at_idx" ON "appointments" USING btree ("dietitian_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_client_id_starts_at_idx" ON "appointments" USING btree ("client_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_holidays_clinic_id_date_idx" ON "clinic_holidays" USING btree ("clinic_id","date");