CREATE TYPE "public"."plan_share_send_channel" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TABLE "plan_share_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"channel" "plan_share_send_channel" NOT NULL,
	"recipient" text,
	"sent_by" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "whatsapp_message_template" text;--> statement-breakpoint
ALTER TABLE "plan_share_sends" ADD CONSTRAINT "plan_share_sends_share_id_plan_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."plan_shares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_share_sends" ADD CONSTRAINT "plan_share_sends_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_plan_id_diet_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."diet_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_share_sends_share_id_idx" ON "plan_share_sends" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_shares_token_idx" ON "plan_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "plan_shares_plan_id_idx" ON "plan_shares" USING btree ("plan_id");