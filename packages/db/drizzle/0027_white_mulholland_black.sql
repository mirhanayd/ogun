ALTER TABLE "medication_substance_mappings" ADD COLUMN "verification_method" text;--> statement-breakpoint
ALTER TABLE "medication_substance_mappings" ADD COLUMN "verification_reason" text;--> statement-breakpoint
ALTER TABLE "medication_substance_mappings" ADD COLUMN "verification_version" text;--> statement-breakpoint
ALTER TABLE "medication_substance_mappings" ADD CONSTRAINT "medication_substance_mappings_verification_check" CHECK ((
        "medication_substance_mappings"."verification_method" is null
        or "medication_substance_mappings"."verification_method" in ('deterministic_exact_v1', 'human_review', 'manual_override')
      ) and (
        "medication_substance_mappings"."mapping_status" <> 'verified'
        or (
          "medication_substance_mappings"."verification_method" is not null
          and "medication_substance_mappings"."verification_reason" is not null
          and "medication_substance_mappings"."verification_version" is not null
        )
      ));