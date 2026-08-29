CREATE TABLE "desktop_mutation_receipts" (
	"clinic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mutation_id" text NOT NULL,
	"kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desktop_mutation_receipts_clinic_id_user_id_mutation_id_pk" PRIMARY KEY("clinic_id","user_id","mutation_id")
);
--> statement-breakpoint
ALTER TABLE "desktop_mutation_receipts" ADD CONSTRAINT "desktop_mutation_receipts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "desktop_mutation_receipts" ADD CONSTRAINT "desktop_mutation_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
