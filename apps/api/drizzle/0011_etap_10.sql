ALTER TABLE "acts" ADD COLUMN "generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "descent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "mark_training" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "mark_mutation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "mark_constellation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "essence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "essence_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_descent_range" CHECK ("characters"."descent_count" between 0 and 10);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_mark_training_range" CHECK ("characters"."mark_training" between 0 and 10);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_mark_mutation_range" CHECK ("characters"."mark_mutation" between 0 and 10);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_mark_constellation_range" CHECK ("characters"."mark_constellation" between 0 and 10);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_essence_non_negative" CHECK ("characters"."essence" >= 0);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_essence_xp_non_negative" CHECK ("characters"."essence_xp" >= 0);