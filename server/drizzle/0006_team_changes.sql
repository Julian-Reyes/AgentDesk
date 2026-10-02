CREATE TYPE "public"."team_action" AS ENUM('initial', 'switch', 'retire', 'reinstate');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('router', 'shopping', 'support');--> statement-breakpoint
CREATE TABLE "team_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" "team_role" NOT NULL,
	"action" "team_action" NOT NULL,
	"model" text NOT NULL,
	"from_model" text,
	"to_model" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "team_changes_role_idx" ON "team_changes" USING btree ("role","id");