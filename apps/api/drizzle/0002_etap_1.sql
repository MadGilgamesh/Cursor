CREATE TABLE "calendars" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_day" text,
	"claimed" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_stats" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"strength" integer NOT NULL,
	"defense" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"evasion" integer NOT NULL,
	"hall" integer DEFAULT 1 NOT NULL,
	"circle" integer DEFAULT 9 NOT NULL,
	"named_wins" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"status_until" timestamp with time zone,
	"addiction_until" timestamp with time zone,
	"tutorial_done" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "class_progress" (
	"character_id" uuid NOT NULL,
	"class_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "class_progress_character_id_class_id_pk" PRIMARY KEY("character_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "combat_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"enemy_id" text NOT NULL,
	"floor" integer NOT NULL,
	"winner" text NOT NULL,
	"log" jsonb NOT NULL,
	"engine_version" integer NOT NULL,
	"balance_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_states" (
	"character_id" uuid NOT NULL,
	"day" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"progress" jsonb NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "daily_states_character_id_day_pk" PRIMARY KEY("character_id","day")
);
--> statement-breakpoint
CREATE TABLE "hunt_boards" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"circle" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"targets" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_instances" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"def_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"quality_bp" integer DEFAULT 10000 NOT NULL,
	"rarity" text DEFAULT 'common' NOT NULL,
	"enhancement" integer DEFAULT 0 NOT NULL,
	"equipped_slot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_instances_quantity_positive" CHECK ("item_instances"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "mission_progress" (
	"character_id" uuid NOT NULL,
	"mission_id" text NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	"loops" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mission_progress_character_id_mission_id_pk" PRIMARY KEY("character_id","mission_id")
);
--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_stats" ADD CONSTRAINT "character_stats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_progress" ADD CONSTRAINT "class_progress_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_logs" ADD CONSTRAINT "combat_logs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_states" ADD CONSTRAINT "daily_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_boards" ADD CONSTRAINT "hunt_boards_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "combat_logs_character_idx" ON "combat_logs" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "item_instances_character_idx" ON "item_instances" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_instances_equipped_slot" ON "item_instances" USING btree ("character_id","equipped_slot");--> statement-breakpoint
-- Postacie sprzed Etapu 1 dostają statystyki startowe (20 punktów = 2000 setnych).
INSERT INTO "character_stats" ("character_id", "strength", "defense", "accuracy", "evasion")
SELECT "id", 2000, 2000, 2000, 2000 FROM "characters"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Zlecenia próbne z Etapu 0 nie mają już definicji: zamykamy je bez nagrody.
UPDATE "timed_activities"
SET "status" = 'claimed',
    "claimed_at" = now(),
    "result" = '{"balanceVersion":1,"success":true,"experience":0,"silver":0,"lifeLoss":0,"sanityLoss":0,"outcome":"Zlecenie próbne zamknięte przy aktualizacji."}'::jsonb
WHERE "def_id" LIKE 'trial.%' AND "status" <> 'claimed';
