CREATE TYPE "public"."approval_kind" AS ENUM('refund', 'goodwill_coupon');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('tents', 'sleeping_bags', 'backpacks', 'stoves', 'headlamps', 'jackets', 'boots');--> statement-breakpoint
CREATE TYPE "public"."coupon_kind" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TYPE "public"."coupon_source" AS ENUM('promo', 'goodwill');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('processing', 'shipped', 'delivered', 'delayed', 'returned', 'lost');--> statement-breakpoint
CREATE TYPE "public"."policy_topic" AS ENUM('shipping', 'returns', 'refunds', 'warranty', 'price_match', 'damaged_items', 'promotions');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('category_sale', 'buy2get1', 'free_shipping');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('damaged', 'lost', 'return', 'late');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('issued', 'pending_approval', 'rejected');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"customer_id" integer NOT NULL,
	"order_number" integer,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_spend_cents" integer DEFAULT 0 NOT NULL,
	"excluded_categories" "category"[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"single_use" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"source" "coupon_source" DEFAULT 'promo' NOT NULL,
	"customer_id" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"order_number" integer,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" integer PRIMARY KEY NOT NULL,
	"order_number" integer NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"returned_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"number" integer PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"status" "order_status" NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"total_paid_cents" integer NOT NULL,
	"coupon_code" text
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"topic" "policy_topic" PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text,
	"color" text,
	"stock" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"description" text NOT NULL,
	"price_cents" integer NOT NULL,
	"rating" double precision NOT NULL,
	"specs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "promotion_type" NOT NULL,
	"params" jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"note" text,
	"status" "refund_status" NOT NULL,
	"approval_id" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"location" text NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_order_number_orders_number_fk" FOREIGN KEY ("order_number") REFERENCES "public"."orders"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_order_number_orders_number_fk" FOREIGN KEY ("order_number") REFERENCES "public"."orders"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_number_orders_number_fk" FOREIGN KEY ("order_number") REFERENCES "public"."orders"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_number_orders_number_fk" FOREIGN KEY ("order_number") REFERENCES "public"."orders"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_order_number_orders_number_fk" FOREIGN KEY ("order_number") REFERENCES "public"."orders"("number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "tracking_order_idx" ON "tracking_events" USING btree ("order_number");