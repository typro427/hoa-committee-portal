
-- CreateEnum
CREATE TYPE "CommitteeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CommitteeRole" AS ENUM ('CHAIR', 'SECRETARY', 'MEMBER');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('REGULAR', 'SPECIAL', 'ANNUAL_PLANNING', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'GUEST');

-- CreateEnum
CREATE TYPE "AgendaSection" AS ENUM ('CALL_TO_ORDER', 'ROLL_CALL', 'APPROVAL_OF_PREVIOUS_MINUTES', 'OLD_BUSINESS', 'NEW_BUSINESS', 'COMMITTEE_REPORTS', 'PROJECT_UPDATES', 'RECOMMENDATIONS', 'OTHER_BUSINESS', 'ADJOURNMENT');

-- CreateEnum
CREATE TYPE "MinutesStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MotionOutcome" AS ENUM ('PASSED', 'FAILED', 'TABLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_ON_INFORMATION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('MEETING_DOCUMENTS', 'FINANCIAL_REPORTS', 'VENDOR_QUOTES', 'PROJECT_DOCUMENTS', 'POLICIES_AND_PROCEDURES', 'GENERAL', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "tagline" TEXT DEFAULT 'Organized Committees. Better Decisions.',
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CommitteeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "pin_hash" TEXT,
    "pin_lookup" TEXT,
    "pin_generated_at" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_memberships" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role" "CommitteeRole" NOT NULL DEFAULT 'MEMBER',
    "position" TEXT,
    "can_publish_minutes" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "committee_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "meeting_type" "MeetingType" NOT NULL DEFAULT 'REGULAR',
    "meeting_date" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by" UUID,
    "created_by_admin" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "member_id" UUID,
    "attendee_name" TEXT NOT NULL,
    "attendance_status" "AttendanceStatus" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendas" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "section" "AgendaSection" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_minutes" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "status" "MinutesStatus" NOT NULL DEFAULT 'DRAFT',
    "chairperson_name" TEXT,
    "secretary_name" TEXT,
    "call_to_order" TEXT,
    "previous_minutes" TEXT,
    "old_business" TEXT,
    "new_business" TEXT,
    "committee_reports" TEXT,
    "project_updates" TEXT,
    "recommendations" TEXT,
    "other_business" TEXT,
    "adjournment_time" TEXT,
    "closing_notes" TEXT,
    "review_comments" TEXT,
    "prepared_by" UUID,
    "prepared_by_admin" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_by_admin" UUID,
    "approved_by_name" TEXT,
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_minutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motions" (
    "id" UUID NOT NULL,
    "minutes_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "moved_by" UUID,
    "moved_by_name" TEXT,
    "seconded_by" UUID,
    "seconded_by_name" TEXT,
    "votes_for" INTEGER NOT NULL DEFAULT 0,
    "votes_against" INTEGER NOT NULL DEFAULT 0,
    "abstentions" INTEGER NOT NULL DEFAULT 0,
    "outcome" "MotionOutcome" NOT NULL DEFAULT 'PASSED',
    "notes" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "meeting_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_member_id" UUID,
    "created_by" UUID,
    "created_by_admin" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "due_date" DATE,
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "completed_by_name" TEXT,
    "completion_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "meeting_id" UUID,
    "agenda_item_id" UUID,
    "task_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DocumentCategory" NOT NULL DEFAULT 'GENERAL',
    "original_filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by" UUID,
    "uploaded_by_admin" UUID,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_minute_revisions" (
    "id" UUID NOT NULL,
    "minutes_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "changed_by" UUID,
    "changed_by_admin" UUID,
    "changed_by_name" TEXT,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_minute_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "member_id" UUID,
    "admin_user_id" UUID,
    "token_hash" TEXT NOT NULL,
    "active_committee_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_member_id" UUID,
    "actor_admin_id" UUID,
    "actor_name" TEXT,
    "committee_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "details_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "committees_organization_id_status_idx" ON "committees"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "committees_organization_id_name_key" ON "committees"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "members_pin_lookup_key" ON "members"("pin_lookup");

-- CreateIndex
CREATE INDEX "members_organization_id_status_idx" ON "members"("organization_id", "status");

-- CreateIndex
CREATE INDEX "members_last_name_first_name_idx" ON "members"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "committee_memberships_member_id_is_active_idx" ON "committee_memberships"("member_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "committee_memberships_committee_id_member_id_key" ON "committee_memberships"("committee_id", "member_id");

-- CreateIndex
CREATE INDEX "meetings_committee_id_meeting_date_idx" ON "meetings"("committee_id", "meeting_date");

-- CreateIndex
CREATE INDEX "meetings_meeting_date_idx" ON "meetings"("meeting_date");

-- CreateIndex
CREATE INDEX "meeting_attendance_meeting_id_idx" ON "meeting_attendance"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendance_meeting_id_member_id_key" ON "meeting_attendance"("meeting_id", "member_id");

-- CreateIndex
CREATE INDEX "agendas_meeting_id_display_order_idx" ON "agendas"("meeting_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_minutes_meeting_id_key" ON "meeting_minutes"("meeting_id");

-- CreateIndex
CREATE INDEX "meeting_minutes_status_idx" ON "meeting_minutes"("status");

-- CreateIndex
CREATE INDEX "motions_minutes_id_idx" ON "motions"("minutes_id");

-- CreateIndex
CREATE INDEX "tasks_committee_id_status_idx" ON "tasks"("committee_id", "status");

-- CreateIndex
CREATE INDEX "tasks_assigned_member_id_status_idx" ON "tasks"("assigned_member_id", "status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_committee_id_category_removed_at_idx" ON "documents"("committee_id", "category", "removed_at");

-- CreateIndex
CREATE INDEX "documents_meeting_id_idx" ON "documents"("meeting_id");

-- CreateIndex
CREATE INDEX "documents_task_id_idx" ON "documents"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_minute_revisions_minutes_id_revision_number_key" ON "meeting_minute_revisions"("minutes_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_member_id_idx" ON "sessions"("member_id");

-- CreateIndex
CREATE INDEX "sessions_admin_user_id_idx" ON "sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_key_created_at_idx" ON "login_attempts"("key", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_committee_id_created_at_idx" ON "audit_logs"("committee_id", "created_at");

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_memberships" ADD CONSTRAINT "committee_memberships_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_memberships" ADD CONSTRAINT "committee_memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_admin_fkey" FOREIGN KEY ("created_by_admin") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minutes" ADD CONSTRAINT "meeting_minutes_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minutes" ADD CONSTRAINT "meeting_minutes_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minutes" ADD CONSTRAINT "meeting_minutes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minutes" ADD CONSTRAINT "meeting_minutes_prepared_by_admin_fkey" FOREIGN KEY ("prepared_by_admin") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minutes" ADD CONSTRAINT "meeting_minutes_approved_by_admin_fkey" FOREIGN KEY ("approved_by_admin") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motions" ADD CONSTRAINT "motions_minutes_id_fkey" FOREIGN KEY ("minutes_id") REFERENCES "meeting_minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motions" ADD CONSTRAINT "motions_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motions" ADD CONSTRAINT "motions_seconded_by_fkey" FOREIGN KEY ("seconded_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_admin_fkey" FOREIGN KEY ("created_by_admin") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "agendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_admin_fkey" FOREIGN KEY ("uploaded_by_admin") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minute_revisions" ADD CONSTRAINT "meeting_minute_revisions_minutes_id_fkey" FOREIGN KEY ("minutes_id") REFERENCES "meeting_minutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minute_revisions" ADD CONSTRAINT "meeting_minute_revisions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_minute_revisions" ADD CONSTRAINT "meeting_minute_revisions_changed_by_admin_fkey" FOREIGN KEY ("changed_by_admin") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Enforce one ACTIVE chair per committee
CREATE UNIQUE INDEX "committee_memberships_one_active_chair"
  ON "committee_memberships" ("committee_id")
  WHERE "role" = 'CHAIR' AND "is_active" = true;
