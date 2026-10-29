CREATE TABLE "awakening_payouts" (
	"week_start" text PRIMARY KEY NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"ranks" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awakening_receipts" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awakening_runs" (
	"week_start" text NOT NULL,
	"character_id" uuid NOT NULL,
	"lodge_id" uuid,
	"level" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "awakening_runs_week_start_character_id_pk" PRIMARY KEY("week_start","character_id")
);
--> statement-breakpoint
CREATE TABLE "dreams" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lodge_members" (
	"lodge_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lodge_members_lodge_id_character_id_pk" PRIMARY KEY("lodge_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "lodge_signups" (
	"summon_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "lodge_signups_summon_id_character_id_pk" PRIMARY KEY("summon_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "lodge_summons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"lodge_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"status" text DEFAULT 'signing' NOT NULL,
	"fight_at" timestamp with time zone NOT NULL,
	"replay" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lodge_voyages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"lodge_id" uuid NOT NULL,
	"status" text DEFAULT 'sailing' NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lodges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"donation_xp" integer DEFAULT 0 NOT NULL,
	"treasury" integer DEFAULT 0 NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recruitment" boolean DEFAULT true NOT NULL,
	"cutter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentorships" (
	"mentee_id" uuid PRIMARY KEY NOT NULL,
	"mentor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voyage_signups" (
	"voyage_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "voyage_signups_voyage_id_character_id_pk" PRIMARY KEY("voyage_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "portal_states" ADD COLUMN "key_cap" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "awakening_receipts" ADD CONSTRAINT "awakening_receipts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awakening_runs" ADD CONSTRAINT "awakening_runs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awakening_runs" ADD CONSTRAINT "awakening_runs_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodge_members" ADD CONSTRAINT "lodge_members_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodge_members" ADD CONSTRAINT "lodge_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodge_signups" ADD CONSTRAINT "lodge_signups_summon_id_lodge_summons_id_fk" FOREIGN KEY ("summon_id") REFERENCES "public"."lodge_summons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodge_signups" ADD CONSTRAINT "lodge_signups_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodge_summons" ADD CONSTRAINT "lodge_summons_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodge_voyages" ADD CONSTRAINT "lodge_voyages_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentee_id_characters_id_fk" FOREIGN KEY ("mentee_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentor_id_characters_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voyage_signups" ADD CONSTRAINT "voyage_signups_voyage_id_lodge_voyages_id_fk" FOREIGN KEY ("voyage_id") REFERENCES "public"."lodge_voyages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voyage_signups" ADD CONSTRAINT "voyage_signups_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lodge_members_character_unique" ON "lodge_members" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "lodge_summons_lodge_idx" ON "lodge_summons" USING btree ("lodge_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lodges_name_lower_unique" ON "lodges" USING btree (lower("name"));