CREATE TABLE "clinic_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_invitations" ADD CONSTRAINT "clinic_invitations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_invitations" ADD CONSTRAINT "clinic_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_invitations" ADD CONSTRAINT "clinic_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_invitations_clinic_id_email_idx" ON "clinic_invitations" USING btree ("clinic_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_invitations_token_hash_idx" ON "clinic_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "clinic_invitations_clinic_id_created_at_idx" ON "clinic_invitations" USING btree ("clinic_id","created_at" DESC NULLS LAST);