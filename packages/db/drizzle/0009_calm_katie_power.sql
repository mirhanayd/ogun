CREATE TYPE "public"."client_activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active', 'very_active');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('tahlil', 'reçete', 'bia_çıktısı', 'fotoğraf', 'diğer');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"category" "document_category" NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"analyte" text NOT NULL,
	"value" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"ref_min" numeric(10, 3),
	"ref_max" numeric(10, 3),
	"lab_name" text,
	"notes" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_health" ADD COLUMN "meals_per_day" integer;--> statement-breakpoint
ALTER TABLE "client_health" ADD COLUMN "eating_out_frequency" text;--> statement-breakpoint
ALTER TABLE "client_health" ADD COLUMN "activity_level" "client_activity_level";--> statement-breakpoint
ALTER TABLE "client_health" ADD COLUMN "activity_notes" text;--> statement-breakpoint
ALTER TABLE "client_health" ADD COLUMN "sleep_quality" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_client_id_created_at_idx" ON "documents" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_client_id_category_idx" ON "documents" USING btree ("client_id","category");--> statement-breakpoint
CREATE INDEX "lab_results_client_id_tested_at_idx" ON "lab_results" USING btree ("client_id","tested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lab_results_client_id_analyte_idx" ON "lab_results" USING btree ("client_id","analyte");