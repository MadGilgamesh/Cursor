CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid,
	"character_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"account_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_account_id_key_pk" PRIMARY KEY("account_id","key")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resource_states" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"life" integer NOT NULL,
	"life_updated_at" timestamp with time zone NOT NULL,
	"vigor" integer NOT NULL,
	"vigor_updated_at" timestamp with time zone NOT NULL,
	"toil" integer NOT NULL,
	"toil_updated_at" timestamp with time zone NOT NULL,
	"sanity" integer NOT NULL,
	"sanity_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resource_states_non_negative" CHECK ("resource_states"."life" >= 0 and "resource_states"."vigor" >= 0 and "resource_states"."toil" >= 0 and "resource_states"."sanity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "timed_activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"type" text NOT NULL,
	"def_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"result_seed" text NOT NULL,
	"result" jsonb,
	"balance_version" integer NOT NULL,
	"loop_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "timed_activities_status" CHECK ("timed_activities"."status" in ('active', 'completed', 'claimed'))
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallet_entries_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"character_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_entries_delta_non_zero" CHECK ("wallet_entries"."delta" <> 0),
	CONSTRAINT "wallet_entries_balance_non_negative" CHECK ("wallet_entries"."balance_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_states" ADD CONSTRAINT "resource_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timed_activities" ADD CONSTRAINT "timed_activities_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_account_idx" ON "audit_log" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_account_idx" ON "push_subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timed_activities_one_open_per_type" ON "timed_activities" USING btree ("character_id","type") WHERE "timed_activities"."status" in ('active', 'completed');--> statement-breakpoint
CREATE INDEX "timed_activities_due_idx" ON "timed_activities" USING btree ("status","end_at");--> statement-breakpoint
CREATE INDEX "timed_activities_character_idx" ON "timed_activities" USING btree ("character_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_idempotency_unique" ON "wallet_entries" USING btree ("character_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "wallet_entries_balance_idx" ON "wallet_entries" USING btree ("character_id","currency","seq");--> statement-breakpoint
-- Postacie założone przed Etapem 0 dostają pełne zasoby (GDD 10.1: Życie 100 + 20·(L−1), Wigor 100, Znój 50, Poczytalność 100).
INSERT INTO "resource_states" ("character_id", "life", "life_updated_at", "vigor", "vigor_updated_at", "toil", "toil_updated_at", "sanity", "sanity_updated_at")
SELECT "id", 100 + 20 * ("level" - 1), now(), 100, now(), 50, now(), 100, now() FROM "characters"
ON CONFLICT DO NOTHING;
