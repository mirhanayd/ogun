CREATE TYPE "public"."client_goal_type" AS ENUM('kilo', 'yağ_oranı', 'çevre');--> statement-breakpoint
CREATE TYPE "public"."measurement_source" AS ENUM('manuel', 'inbody', 'tanita', 'accuniq');--> statement-breakpoint
CREATE TABLE "client_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"type" "client_goal_type" NOT NULL,
	"target_value" numeric(6, 2) NOT NULL,
	"target_date" date,
	"start_value" numeric(6, 2) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"achieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "measurement_source" DEFAULT 'manuel' NOT NULL,
	"weight_kg" numeric(5, 2),
	"height_cm" numeric(5, 1),
	"waist_cm" numeric(5, 1),
	"hip_cm" numeric(5, 1),
	"neck_cm" numeric(5, 1),
	"arm_cm" numeric(5, 1),
	"thigh_cm" numeric(5, 1),
	"chest_cm" numeric(5, 1),
	"body_fat_pct" numeric(4, 1),
	"body_fat_kg" numeric(5, 2),
	"lean_mass_kg" numeric(5, 2),
	"muscle_mass_kg" numeric(5, 2),
	"total_body_water_l" numeric(5, 2),
	"visceral_fat_level" integer,
	"bmr_kcal" integer,
	"phase_angle" numeric(4, 2),
	"notes" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_goals_client_id_started_at_idx" ON "client_goals" USING btree ("client_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "measurements_client_id_measured_at_idx" ON "measurements" USING btree ("client_id","measured_at" DESC NULLS LAST);