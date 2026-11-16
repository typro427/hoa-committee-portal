-- CreateEnum
CREATE TYPE "ArbStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_NEEDED', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'DENIED', 'CONSTRUCTION_IN_PROGRESS', 'AWAITING_BUILDING_PERMIT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ArbProjectType" AS ENUM ('NEW_CONSTRUCTION', 'ADDITION', 'DECK_OR_PATIO', 'FENCE', 'POOL_OR_SPA', 'SHED_OR_ACCESSORY', 'DRIVEWAY', 'ROOF', 'EXTERIOR_PAINT', 'LANDSCAPING', 'SOLAR', 'OTHER');

-- CreateEnum
CREATE TYPE "ArbDocType" AS ENUM ('PLAT_PLAN', 'ELEVATIONS', 'UTILITY_LOCATIONS', 'BUILDING_PERMIT', 'OTHER');

-- CreateEnum
CREATE TYPE "UtilityPlacement" AS ENUM ('OVERHEAD', 'BURIED', 'NOT_APPLICABLE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "committees" ADD COLUMN     "handles_arb_requests" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "arb_doc_type" "ArbDocType",
ADD COLUMN     "arb_request_id" UUID,
ADD COLUMN     "uploaded_by_resident" TEXT;

-- CreateTable
CREATE TABLE "arb_requests" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "reference_number" TEXT NOT NULL,
    "status" "ArbStatus" NOT NULL DEFAULT 'SUBMITTED',
    "applicant_name" TEXT NOT NULL,
    "applicant_email" TEXT,
    "applicant_phone" TEXT,
    "property_address" TEXT NOT NULL,
    "lot_number" TEXT,
    "project_type" "ArbProjectType" NOT NULL,
    "description" TEXT NOT NULL,
    "contractor_name" TEXT,
    "estimated_start" DATE,
    "estimated_finish" DATE,
    "water_line" "UtilityPlacement" NOT NULL DEFAULT 'UNKNOWN',
    "gas_line" "UtilityPlacement" NOT NULL DEFAULT 'UNKNOWN',
    "electric_line" "UtilityPlacement" NOT NULL DEFAULT 'UNKNOWN',
    "utility_notes" TEXT,
    "decision_notes" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_name" TEXT,
    "completed_at" TIMESTAMP(3),
    "access_token_hash" TEXT NOT NULL,
    "submitted_by_staff" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arb_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arb_request_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from_status" "ArbStatus",
    "to_status" "ArbStatus",
    "message" TEXT,
    "visible_to_resident" BOOLEAN NOT NULL DEFAULT false,
    "actor_name" TEXT NOT NULL,
    "actor_member_id" UUID,
    "actor_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arb_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arb_requests_reference_number_key" ON "arb_requests"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX "arb_requests_access_token_hash_key" ON "arb_requests"("access_token_hash");

-- CreateIndex
CREATE INDEX "arb_requests_committee_id_status_idx" ON "arb_requests"("committee_id", "status");

-- CreateIndex
CREATE INDEX "arb_requests_property_address_idx" ON "arb_requests"("property_address");

-- CreateIndex
CREATE INDEX "arb_request_events_request_id_created_at_idx" ON "arb_request_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "documents_arb_request_id_idx" ON "documents"("arb_request_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_arb_request_id_fkey" FOREIGN KEY ("arb_request_id") REFERENCES "arb_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arb_requests" ADD CONSTRAINT "arb_requests_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arb_request_events" ADD CONSTRAINT "arb_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "arb_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The Architectural Review Board handles resident requests by default (admins can change this per committee).
UPDATE "committees" SET "handles_arb_requests" = true WHERE "name" ILIKE '%architectural%';
