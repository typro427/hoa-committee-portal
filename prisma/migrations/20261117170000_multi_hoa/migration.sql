-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- DropIndex
DROP INDEX "admin_users_email_key";

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "owner_notes" TEXT,
ADD COLUMN     "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "organization_id" UUID;
-- Existing administrators belong to the original (first) HOA.
UPDATE "admin_users" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1);
ALTER TABLE "admin_users" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "platform_user_id" UUID;

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_organization_id_email_key" ON "admin_users"("organization_id", "email");

-- CreateIndex
CREATE INDEX "sessions_platform_user_id_idx" ON "sessions"("platform_user_id");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

