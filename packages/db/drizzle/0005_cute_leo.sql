CREATE TABLE "clinic_working_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "onboarding_step" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clinic_working_hours" ADD CONSTRAINT "clinic_working_hours_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_working_hours_clinic_id_day_of_week_idx" ON "clinic_working_hours" USING btree ("clinic_id","day_of_week");--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;