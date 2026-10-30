CREATE TABLE "portal_states" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"regen_keys" integer DEFAULT 0 NOT NULL,
	"regen_updated_at" timestamp with time zone NOT NULL,
	"loot_keys" integer DEFAULT 0 NOT NULL,
	"shards" integer DEFAULT 0 NOT NULL,
	"meteor_shards" integer DEFAULT 0 NOT NULL,
	"engraver_day" text,
	"engraver_count" integer DEFAULT 0 NOT NULL,
	"cleared_domain" integer DEFAULT 0 NOT NULL,
	"cleared_stage" integer DEFAULT 0 NOT NULL,
	"cleared_substage" integer DEFAULT 0 NOT NULL,
	"materials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sigil_shards" integer DEFAULT 0 NOT NULL,
	"sigils" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"well_floor" integer DEFAULT 0 NOT NULL,
	"well_guardians" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"whisper_id" text,
	"whisper_until_floor" integer DEFAULT 0 NOT NULL,
	"candles" integer DEFAULT 3 NOT NULL,
	"seance_dry" integer DEFAULT 0 NOT NULL,
	"beyond_dry" integer DEFAULT 0 NOT NULL,
	"ectoplasm" integer DEFAULT 0 NOT NULL,
	"echoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_echo_id" text
);
--> statement-breakpoint
ALTER TABLE "portal_states" ADD CONSTRAINT "portal_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Postacie założone przed Etapem 2 dostają pusty Pęk (regeneracja liczy się od tej migracji).
INSERT INTO "portal_states" ("character_id", "regen_updated_at")
SELECT "id", now() FROM "characters"
ON CONFLICT ("character_id") DO NOTHING;