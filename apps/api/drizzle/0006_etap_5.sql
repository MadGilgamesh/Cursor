CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"seller_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"min_bid" integer NOT NULL,
	"buy_now" integer,
	"current_bid" integer DEFAULT 0 NOT NULL,
	"bidder_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_blocks" (
	"character_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	CONSTRAINT "chat_blocks_character_id_blocked_id_pk" PRIMARY KEY("character_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel" text NOT NULL,
	"character_id" uuid NOT NULL,
	"body" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"message_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_trades" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"maker_id" uuid NOT NULL,
	"taker_id" uuid NOT NULL,
	"item_id" uuid,
	"silver" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"character_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	CONSTRAINT "friendships_character_id_friend_id_pk" PRIMARY KEY("character_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "mails" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"body" text NOT NULL,
	"silver" integer DEFAULT 0 NOT NULL,
	"good_id" text,
	"good_qty" integer DEFAULT 0 NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_books" (
	"good_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_fills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"good_id" text NOT NULL,
	"buy_order_id" uuid NOT NULL,
	"sell_order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"good_id" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"price" integer,
	"quantity" integer NOT NULL,
	"remaining" integer NOT NULL,
	"escrow_silver" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_states" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"goods" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_states" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"levels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candle_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "item_instances" ADD COLUMN "hold" text;--> statement-breakpoint
ALTER TABLE "world_states" ADD COLUMN "crate" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_id_characters_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_item_id_item_instances_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_bidder_id_characters_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocked_id_characters_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_characters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_trades" ADD CONSTRAINT "direct_trades_maker_id_characters_id_fk" FOREIGN KEY ("maker_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_trades" ADD CONSTRAINT "direct_trades_taker_id_characters_id_fk" FOREIGN KEY ("taker_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_trades" ADD CONSTRAINT "direct_trades_item_id_item_instances_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_characters_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_from_id_characters_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_to_id_characters_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_fills" ADD CONSTRAINT "market_fills_buyer_id_characters_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_fills" ADD CONSTRAINT "market_fills_seller_id_characters_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_states" ADD CONSTRAINT "market_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_states" ADD CONSTRAINT "workshop_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reports_once" ON "chat_reports" USING btree ("message_id","reporter_id");--> statement-breakpoint
CREATE INDEX "market_orders_book_idx" ON "market_orders" USING btree ("good_id","status");
--> statement-breakpoint
-- Postacie sprzed Etapu 5 dostają pusty skład i warsztat.
INSERT INTO "market_states" ("character_id")
SELECT "id" FROM "characters"
ON CONFLICT ("character_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "workshop_states" ("character_id")
SELECT "id" FROM "characters"
ON CONFLICT ("character_id") DO NOTHING;