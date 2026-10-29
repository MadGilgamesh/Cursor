CREATE TABLE "lore_states" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"knowledge" integer DEFAULT 0 NOT NULL,
	"scars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"madness_ui" boolean DEFAULT true NOT NULL,
	"composure" integer DEFAULT 0 NOT NULL,
	"insight" integer DEFAULT 0 NOT NULL,
	"stealth" integer DEFAULT 0 NOT NULL,
	"course_id" text,
	"course_ends_at" timestamp with time zone,
	"courses_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constellation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extinct_open" boolean DEFAULT false NOT NULL,
	"reputation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"residents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"case_seed" text,
	"case_found" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"case_deadline" timestamp with time zone,
	"case_status" text DEFAULT 'none' NOT NULL,
	"document_clue_id" text,
	"document_ends_at" timestamp with time zone,
	"reading_id" text,
	"reading_ends_at" timestamp with time zone,
	"books_read" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bestiary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bestiary_sigils" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unrest_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mission_progress" ADD COLUMN "deepening" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_states" ADD COLUMN "ichor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_states" ADD COLUMN "reforge_day" text;--> statement-breakpoint
ALTER TABLE "portal_states" ADD COLUMN "reforge_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_states" ADD COLUMN "star_tracks" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lore_states" ADD CONSTRAINT "lore_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Postacie sprzed Etapu 3 dostają pustą Wiedzę i trzech Mieszkańców Soli.
INSERT INTO "lore_states" ("character_id", "residents")
SELECT "id", '[{"id":"holst","familiarity":0,"gone":false},{"id":"vey","familiarity":0,"gone":false},{"id":"orlen","familiarity":0,"gone":false}]'::jsonb
FROM "characters"
ON CONFLICT ("character_id") DO NOTHING;