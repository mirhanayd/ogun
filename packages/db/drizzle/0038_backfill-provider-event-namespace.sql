-- Before Faz 7, iyzico was the only webhook producer and provider identity was
-- implicit. Namespace historical webhook events so a replay cannot bypass the
-- new (provider, provider_event_id) uniqueness guarantee through a NULL value.
UPDATE "subscription_events"
SET "provider" = 'iyzico'
WHERE "source" = 'provider'
  AND "provider_event_id" IS NOT NULL
  AND "provider" IS NULL;
