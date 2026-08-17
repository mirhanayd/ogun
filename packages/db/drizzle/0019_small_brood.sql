CREATE TABLE "feedback_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"user_id" text NOT NULL,
	"page" text NOT NULL,
	"message" text NOT NULL,
	"console_log" text,
	"screenshot_data_url" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_search_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"result_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text,
	"user_id" text,
	"event_name" text NOT NULL,
	"screen" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "product_tour_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_search_logs" ADD CONSTRAINT "food_search_logs_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_reports_clinic_id_idx" ON "feedback_reports" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "food_search_logs_clinic_id_idx" ON "food_search_logs" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "food_search_logs_normalized_query_idx" ON "food_search_logs" USING btree ("normalized_query");--> statement-breakpoint
CREATE INDEX "food_search_logs_result_count_idx" ON "food_search_logs" USING btree ("result_count");--> statement-breakpoint
CREATE INDEX "usage_events_clinic_id_idx" ON "usage_events" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "usage_events_event_name_idx" ON "usage_events" USING btree ("event_name");