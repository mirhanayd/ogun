CREATE TYPE "public"."pdf_density" AS ENUM('compact', 'spacious');--> statement-breakpoint
ALTER TYPE "public"."document_category" ADD VALUE 'diyet_listesi' BEFORE 'diğer';--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "pdf_default_density" "pdf_density" DEFAULT 'spacious' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "pdf_default_show_calories" boolean DEFAULT true NOT NULL;