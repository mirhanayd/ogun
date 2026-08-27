CREATE TYPE "public"."subscription_billing_cycle" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "subscription_selections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_code" "subscription_plan" NOT NULL,
	"billing_cycle" "subscription_billing_cycle" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_cycle" "subscription_billing_cycle" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "checkout_token" text;--> statement-breakpoint
ALTER TABLE "subscription_selections" ADD CONSTRAINT "subscription_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_selections_user_id_idx" ON "subscription_selections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_checkout_token_idx" ON "subscriptions" USING btree ("checkout_token");