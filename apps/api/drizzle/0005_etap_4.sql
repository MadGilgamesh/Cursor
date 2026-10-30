CREATE TABLE "world_states" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"city" text DEFAULT 'salt' NOT NULL,
	"travel_to" text,
	"travel_ends_at" timestamp with time zone,
	"travel_ambush" text,
	"mount_id" text,
	"mount_until" timestamp with time zone,
	"contamination" integer DEFAULT 0 NOT NULL,
	"seal_day" text,
	"seal_count" integer DEFAULT 0 NOT NULL,
	"sealed_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"item_brands" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seeds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pantry" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cast_seed" text,
	"cast_at" timestamp with time zone,
	"hooks" integer DEFAULT 5 NOT NULL,
	"basket" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"journal" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legends" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"residents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"city_reputation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"clinic_ends_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "world_states" ADD CONSTRAINT "world_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Postacie sprzed Etapu 4 dostają ogród, dwa piołuny i mieszkańców trzech miast.
INSERT INTO "world_states" ("character_id", "plots", "seeds", "hooks", "residents")
SELECT "id",
  '[{"cropId":null,"plantedAt":null,"wateredAt":null},{"cropId":null,"plantedAt":null,"wateredAt":null},{"cropId":null,"plantedAt":null,"wateredAt":null},{"cropId":null,"plantedAt":null,"wateredAt":null}]'::jsonb,
  '{"wormwood":2}'::jsonb,
  5,
  '[{"city":"ilmar","id":"idris","familiarity":0,"gone":false},{"city":"ilmar","id":"lior","familiarity":0,"gone":false},{"city":"mire","id":"moire","familiarity":0,"gone":false},{"city":"mire","id":"silt","familiarity":0,"gone":false},{"city":"brink","id":"kaspar","familiarity":0,"gone":false},{"city":"brink","id":"nera","familiarity":0,"gone":false}]'::jsonb
FROM "characters"
ON CONFLICT ("character_id") DO NOTHING;