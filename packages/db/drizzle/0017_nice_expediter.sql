CREATE TYPE "public"."client_package_status" AS ENUM('aktif', 'tamamlandı', 'süresi_doldu', 'iptal');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('nakit', 'kart', 'havale', 'online');--> statement-breakpoint
CREATE TABLE "packages" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"name" text NOT NULL,
	"session_count" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"validity_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"package_id" text NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"sessions_used" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "client_package_status" DEFAULT 'aktif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_package_id" text,
	"amount" numeric(10, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"receipt_number" text,
	"receipt_series" text,
	"receipt_sequence_number" text,
	"receipt_issued_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_package_id_client_packages_id_fk" FOREIGN KEY ("client_package_id") REFERENCES "public"."client_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "packages_clinic_id_is_active_idx" ON "packages" USING btree ("clinic_id","is_active");--> statement-breakpoint
CREATE INDEX "client_packages_client_id_status_idx" ON "client_packages" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "expenses_clinic_id_date_idx" ON "expenses" USING btree ("clinic_id","date");--> statement-breakpoint
CREATE INDEX "payments_clinic_id_paid_at_idx" ON "payments" USING btree ("clinic_id","paid_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_client_id_paid_at_idx" ON "payments" USING btree ("client_id","paid_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_package_session_id_client_packages_id_fk" FOREIGN KEY ("package_session_id") REFERENCES "public"."client_packages"("id") ON DELETE no action ON UPDATE no action;