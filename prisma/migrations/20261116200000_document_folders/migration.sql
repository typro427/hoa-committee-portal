-- Per-committee document folders (replaces the fixed DocumentCategory list).

CREATE TABLE "document_folders" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_folders_committee_id_name_key" ON "document_folders"("committee_id", "name");
CREATE INDEX "document_folders_committee_id_display_order_idx" ON "document_folders"("committee_id", "display_order");
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_committee_id_fkey"
    FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents" ADD COLUMN "folder_id" UUID;
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Give every existing committee the standard folders.
INSERT INTO "document_folders" ("id", "committee_id", "name", "display_order", "updated_at")
SELECT gen_random_uuid(), c."id", f."name", f."ord", CURRENT_TIMESTAMP
FROM "committees" c
CROSS JOIN (VALUES
    ('MEETING_DOCUMENTS', 'Meeting Documents', 10),
    ('FINANCIAL_REPORTS', 'Financial Reports', 20),
    ('VENDOR_QUOTES', 'Vendor Quotes', 30),
    ('PROJECT_DOCUMENTS', 'Project Documents', 40),
    ('POLICIES_AND_PROCEDURES', 'Policies and Procedures', 50),
    ('GENERAL', 'General Committee Documents', 60),
    ('ARCHIVED', 'Archived Documents', 70)
) AS f("category", "name", "ord");

-- Move each existing document into the folder matching its old category.
UPDATE "documents" d
SET "folder_id" = df."id"
FROM "document_folders" df
WHERE df."committee_id" = d."committee_id"
  AND df."name" = CASE d."category"::text
      WHEN 'MEETING_DOCUMENTS' THEN 'Meeting Documents'
      WHEN 'FINANCIAL_REPORTS' THEN 'Financial Reports'
      WHEN 'VENDOR_QUOTES' THEN 'Vendor Quotes'
      WHEN 'PROJECT_DOCUMENTS' THEN 'Project Documents'
      WHEN 'POLICIES_AND_PROCEDURES' THEN 'Policies and Procedures'
      WHEN 'GENERAL' THEN 'General Committee Documents'
      WHEN 'ARCHIVED' THEN 'Archived Documents'
  END;

DROP INDEX "documents_committee_id_category_removed_at_idx";
ALTER TABLE "documents" DROP COLUMN "category";
DROP TYPE "DocumentCategory";
CREATE INDEX "documents_committee_id_folder_id_removed_at_idx" ON "documents"("committee_id", "folder_id", "removed_at");
