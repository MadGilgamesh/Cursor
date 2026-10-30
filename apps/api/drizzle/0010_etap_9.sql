CREATE TABLE "abyss_payouts" (
	"week_key" text PRIMARY KEY NOT NULL,
	"paid_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abyss_ranks" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"floor" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "abyss_receipts" (
	"week_key" text NOT NULL,
	"character_id" uuid NOT NULL,
	"sigils" integer NOT NULL,
	CONSTRAINT "abyss_receipts_week_key_character_id_pk" PRIMARY KEY("week_key","character_id")
);
--> statement-breakpoint
CREATE TABLE "act_contributions" (
	"act_id" text NOT NULL,
	"character_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"raw_pl" integer DEFAULT 0 NOT NULL,
	"raw_pk" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "act_contributions_act_id_character_id_day_index_pk" PRIMARY KEY("act_id","character_id","day_index")
);
--> statement-breakpoint
CREATE TABLE "act_rewards" (
	"act_id" text NOT NULL,
	"character_id" uuid NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "act_rewards_act_id_character_id_kind_pk" PRIMARY KEY("act_id","character_id","kind")
);
--> statement-breakpoint
CREATE TABLE "acts" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"pace" text NOT NULL,
	"clock_bp" integer DEFAULT 0 NOT NULL,
	"closed_days" integer DEFAULT 0 NOT NULL,
	"finale" text DEFAULT 'pending' NOT NULL,
	"thresholds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_pk" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_claims" (
	"character_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"day_key" text NOT NULL,
	CONSTRAINT "event_claims_character_id_event_id_day_key_pk" PRIMARY KEY("character_id","event_id","day_key")
);
--> statement-breakpoint
CREATE TABLE "lantern_applications" (
	"week_key" text NOT NULL,
	"sleeper_id" text NOT NULL,
	"lodge_id" uuid NOT NULL,
	"defense" integer NOT NULL,
	CONSTRAINT "lantern_applications_week_key_sleeper_id_lodge_id_pk" PRIMARY KEY("week_key","sleeper_id","lodge_id")
);
--> statement-breakpoint
CREATE TABLE "lantern_stands" (
	"week_key" text NOT NULL,
	"sleeper_id" text NOT NULL,
	"character_id" uuid NOT NULL,
	"lodge_id" uuid NOT NULL,
	CONSTRAINT "lantern_stands_week_key_sleeper_id_character_id_pk" PRIMARY KEY("week_key","sleeper_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "lantern_states" (
	"sleeper_id" text PRIMARY KEY NOT NULL,
	"lodge_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_week" text
);
--> statement-breakpoint
CREATE TABLE "marriages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"proposer_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"rite" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patron_claims" (
	"character_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"day_key" text NOT NULL,
	CONSTRAINT "patron_claims_character_id_kind_day_key_pk" PRIMARY KEY("character_id","kind","day_key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"referred_id" uuid PRIMARY KEY NOT NULL,
	"referrer_id" uuid NOT NULL,
	"purchased" boolean DEFAULT false NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email_verify_code" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "patron_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "titles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "cosmetics" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "abyss_ranks" ADD CONSTRAINT "abyss_ranks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abyss_receipts" ADD CONSTRAINT "abyss_receipts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_contributions" ADD CONSTRAINT "act_contributions_act_id_acts_id_fk" FOREIGN KEY ("act_id") REFERENCES "public"."acts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_contributions" ADD CONSTRAINT "act_contributions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_rewards" ADD CONSTRAINT "act_rewards_act_id_acts_id_fk" FOREIGN KEY ("act_id") REFERENCES "public"."acts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_rewards" ADD CONSTRAINT "act_rewards_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lantern_applications" ADD CONSTRAINT "lantern_applications_sleeper_id_lantern_states_sleeper_id_fk" FOREIGN KEY ("sleeper_id") REFERENCES "public"."lantern_states"("sleeper_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lantern_applications" ADD CONSTRAINT "lantern_applications_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lantern_stands" ADD CONSTRAINT "lantern_stands_sleeper_id_lantern_states_sleeper_id_fk" FOREIGN KEY ("sleeper_id") REFERENCES "public"."lantern_states"("sleeper_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lantern_stands" ADD CONSTRAINT "lantern_stands_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lantern_stands" ADD CONSTRAINT "lantern_stands_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lantern_states" ADD CONSTRAINT "lantern_states_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marriages" ADD CONSTRAINT "marriages_proposer_id_characters_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marriages" ADD CONSTRAINT "marriages_partner_id_characters_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patron_claims" ADD CONSTRAINT "patron_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_characters_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_characters_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_unique" ON "payments" USING btree ("provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_referral_code_unique" ON "accounts" USING btree ("referral_code");