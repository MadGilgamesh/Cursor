CREATE TABLE "escorts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"protector_id" uuid NOT NULL,
	"ward_id" uuid NOT NULL,
	"city" text NOT NULL,
	"status" text NOT NULL,
	"ambush_taken" boolean DEFAULT false NOT NULL,
	"sanity_cut" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedition_entries" (
	"character_id" uuid NOT NULL,
	"def_id" text NOT NULL,
	"week_key" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expedition_entries_character_id_def_id_week_key_pk" PRIMARY KEY("character_id","def_id","week_key")
);
--> statement-breakpoint
CREATE TABLE "expedition_members" (
	"expedition_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"assist" boolean DEFAULT false NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"class_id" text,
	"sanity" integer,
	"max_sanity" integer,
	"level" integer,
	"share" integer,
	CONSTRAINT "expedition_members_expedition_id_character_id_pk" PRIMARY KEY("expedition_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "expeditions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"leader_id" uuid NOT NULL,
	"def_id" text NOT NULL,
	"status" text NOT NULL,
	"week_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"seed" text,
	"pool" integer,
	"shared_sanity" integer,
	"missed" integer,
	"betrayer_id" uuid,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escorts" ADD CONSTRAINT "escorts_protector_id_characters_id_fk" FOREIGN KEY ("protector_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escorts" ADD CONSTRAINT "escorts_ward_id_characters_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_entries" ADD CONSTRAINT "expedition_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_members" ADD CONSTRAINT "expedition_members_expedition_id_expeditions_id_fk" FOREIGN KEY ("expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_members" ADD CONSTRAINT "expedition_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_leader_id_characters_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;