-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RESUBMIT_REQUESTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('PRACTICE', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ResultPolicy" AS ENUM ('MANUAL', 'AFTER_CLOSE', 'WHEN_GRADED');

-- CreateEnum
CREATE TYPE "SolutionPolicy" AS ENUM ('NEVER', 'WITH_RESULTS');

-- CreateEnum
CREATE TYPE "HelpPolicy" AS ENUM ('NO_HELP_WHILE_OPEN', 'PRIVATE_CLARIFICATION', 'ALLOWED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ_SINGLE', 'MCQ_MULTI', 'SHORT_ANSWER', 'CODING');

-- CreateEnum
CREATE TYPE "CodingScoring" AS ENUM ('ALL_OR_NOTHING', 'PROPORTIONAL');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "AttemptGradingStatus" AS ENUM ('NOT_STARTED', 'AWAITING_GRADING', 'PARTIALLY_GRADED', 'GRADED');

-- CreateEnum
CREATE TYPE "AnswerGradeStatus" AS ENUM ('PENDING', 'UNANSWERED', 'AUTO_GRADED', 'NEEDS_REVIEW', 'REVIEWED', 'EXECUTION_ERROR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('PASSED', 'WRONG_ANSWER', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT', 'MEMORY_LIMIT', 'EXECUTION_ERROR');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SERVICE_ERROR');

-- CreateEnum
CREATE TYPE "RunPurpose" AS ENUM ('PLAYGROUND', 'ASSESSMENT_PRACTICE');

-- CreateEnum
CREATE TYPE "DoubtStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DoubtVisibility" AS ENUM ('PRIVATE', 'BATCH');

-- CreateEnum
CREATE TYPE "ProjectSubmissionStatus" AS ENUM ('SUBMITTED', 'RESUBMIT_REQUESTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "InterviewOutcome" AS ENUM ('PENDING', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlacementReviewStatus" AS ENUM ('NOT_REVIEWED', 'ELIGIBLE', 'NOT_ELIGIBLE', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "RefundReviewStatus" AS ENUM ('NOT_APPLICABLE', 'UNDER_REVIEW', 'MUTUALLY_AGREED', 'NOT_AGREED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT_PUBLISHED', 'TEST_PUBLISHED', 'PROJECT_PUBLISHED', 'DEADLINE_SOON', 'DOUBT_REPLY', 'DOUBT_STATUS', 'RESULT_RELEASED', 'FEEDBACK', 'ANNOUNCEMENT', 'CLASS_SCHEDULED', 'NEW_DOUBT', 'SUBMISSION_RECEIVED');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('ASSIGNMENT_RESOURCE', 'SUBMISSION', 'DOUBT_ATTACHMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "suspendedAt" TIMESTAMPTZ(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "graduationYear" INTEGER,
    "background" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrolment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "endReason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "batchId" TEXT,
    "startDate" TIMESTAMPTZ(3),
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "userId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "allowLate" BOOLEAN NOT NULL DEFAULT false,
    "maxMarks" INTEGER NOT NULL DEFAULT 10,
    "responseTypes" TEXT[],
    "notifiedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentTarget" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "batchId" TEXT,
    "studentId" TEXT,

    CONSTRAINT "AssignmentTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "textResponse" TEXT,
    "code" TEXT,
    "codeLanguage" TEXT,
    "linkUrl" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "marks" DOUBLE PRECISION,
    "feedback" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionHistory" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL,
    "isLate" BOOLEAN NOT NULL,

    CONSTRAINT "SubmissionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "kind" "AssessmentKind" NOT NULL DEFAULT 'PRACTICE',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMPTZ(3),
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "passPercent" INTEGER,
    "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
    "resultPolicy" "ResultPolicy" NOT NULL DEFAULT 'MANUAL',
    "solutionPolicy" "SolutionPolicy" NOT NULL DEFAULT 'NEVER',
    "helpPolicy" "HelpPolicy" NOT NULL DEFAULT 'NO_HELP_WHILE_OPEN',
    "resultsReleasedAt" TIMESTAMPTZ(3),
    "notifiedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "lockedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTarget" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "batchId" TEXT,
    "studentId" TEXT,

    CONSTRAINT "AssessmentTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "topic" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "options" JSONB,
    "correctOptionIds" TEXT[],
    "solution" TEXT,
    "inputFormat" TEXT,
    "outputFormat" TEXT,
    "constraints" TEXT,
    "starterCode" JSONB,
    "allowedLanguages" TEXT[],
    "timeLimitMs" INTEGER,
    "memoryLimitKb" INTEGER,
    "scoring" "CodingScoring",

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingCase" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CodingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "questionOrder" TEXT[],
    "gradingStatus" "AttemptGradingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "textAnswer" TEXT,
    "code" TEXT,
    "languageKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "savedAt" TIMESTAMPTZ(3),
    "gradeStatus" "AnswerGradeStatus" NOT NULL DEFAULT 'PENDING',
    "marksAwarded" DOUBLE PRECISION,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingJob" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "tries" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GradingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeCaseResult" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "outcome" "CaseOutcome" NOT NULL,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "stdoutPreview" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeCaseResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stdin" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CodeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "RunPurpose" NOT NULL DEFAULT 'PLAYGROUND',
    "attemptId" TEXT,
    "languageKey" TEXT NOT NULL,
    "languageLabel" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "stdin" TEXT NOT NULL DEFAULT '',
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" TEXT,
    "stdout" TEXT,
    "stderr" TEXT,
    "compileOutput" TEXT,
    "exitCode" INTEGER,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "providerToken" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CodeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubtThread" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "DoubtStatus" NOT NULL DEFAULT 'OPEN',
    "visibility" "DoubtVisibility" NOT NULL DEFAULT 'PRIVATE',
    "assignmentId" TEXT,
    "assessmentId" TEXT,
    "projectBriefId" TEXT,
    "assignedToId" TEXT,
    "firstResponseAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubtThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubtMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "codeSnippet" TEXT,
    "codeLanguage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubtMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBrief" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "starterTemplate" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "notifiedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBriefTarget" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "batchId" TEXT,
    "studentId" TEXT,

    CONSTRAINT "ProjectBriefTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceProject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "briefId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkspaceProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkspaceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "briefId" TEXT,
    "studentId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "totalBytes" INTEGER NOT NULL,
    "note" TEXT,
    "status" "ProjectSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "marks" DOUBLE PRECISION,
    "feedback" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "resources" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedById" TEXT NOT NULL,
    "markedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerFeedback" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacementInterview" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "attended" BOOLEAN,
    "outcome" "InterviewOutcome" NOT NULL DEFAULT 'PENDING',
    "companyFeedback" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlacementInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacementReview" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "PlacementReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "refundStatus" "RefundReviewStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlacementReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "batchId" TEXT,
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "assignmentId" TEXT,
    "submissionId" TEXT,
    "doubtMessageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_code_key" ON "Batch"("code");

-- CreateIndex
CREATE INDEX "Batch_archivedAt_idx" ON "Batch"("archivedAt");

-- CreateIndex
CREATE INDEX "Enrolment_studentId_status_idx" ON "Enrolment"("studentId", "status");

-- CreateIndex
CREATE INDEX "Enrolment_batchId_status_idx" ON "Enrolment"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_userId_key" ON "Invitation"("userId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Assignment_status_publishAt_idx" ON "Assignment"("status", "publishAt");

-- CreateIndex
CREATE INDEX "Assignment_dueAt_idx" ON "Assignment"("dueAt");

-- CreateIndex
CREATE INDEX "AssignmentTarget_batchId_idx" ON "AssignmentTarget"("batchId");

-- CreateIndex
CREATE INDEX "AssignmentTarget_studentId_idx" ON "AssignmentTarget"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentTarget_assignmentId_batchId_key" ON "AssignmentTarget"("assignmentId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentTarget_assignmentId_studentId_key" ON "AssignmentTarget"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "Submission_studentId_status_idx" ON "Submission"("studentId", "status");

-- CreateIndex
CREATE INDEX "Submission_assignmentId_status_idx" ON "Submission"("assignmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key" ON "Submission"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionHistory_submissionId_revision_key" ON "SubmissionHistory"("submissionId", "revision");

-- CreateIndex
CREATE INDEX "Assessment_status_publishAt_idx" ON "Assessment"("status", "publishAt");

-- CreateIndex
CREATE INDEX "Assessment_closesAt_idx" ON "Assessment"("closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_assessmentId_number_key" ON "AssessmentVersion"("assessmentId", "number");

-- CreateIndex
CREATE INDEX "AssessmentTarget_batchId_idx" ON "AssessmentTarget"("batchId");

-- CreateIndex
CREATE INDEX "AssessmentTarget_studentId_idx" ON "AssessmentTarget"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTarget_assessmentId_batchId_key" ON "AssessmentTarget"("assessmentId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTarget_assessmentId_studentId_key" ON "AssessmentTarget"("assessmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_versionId_order_key" ON "Question"("versionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CodingCase_questionId_order_key" ON "CodingCase"("questionId", "order");

-- CreateIndex
CREATE INDEX "Attempt_status_deadlineAt_idx" ON "Attempt"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "Attempt_studentId_idx" ON "Attempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_assessmentId_studentId_number_key" ON "Attempt"("assessmentId", "studentId", "number");

-- CreateIndex
CREATE INDEX "AttemptAnswer_gradeStatus_idx" ON "AttemptAnswer"("gradeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptId_questionId_key" ON "AttemptAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingJob_answerId_key" ON "GradingJob"("answerId");

-- CreateIndex
CREATE INDEX "GradingJob_status_idx" ON "GradingJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CodeCaseResult_answerId_caseId_key" ON "CodeCaseResult"("answerId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CodeDraft_userId_languageKey_key" ON "CodeDraft"("userId", "languageKey");

-- CreateIndex
CREATE INDEX "CodeRun_userId_createdAt_idx" ON "CodeRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeRun_status_idx" ON "CodeRun"("status");

-- CreateIndex
CREATE INDEX "DoubtThread_status_lastActivityAt_idx" ON "DoubtThread"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "DoubtThread_studentId_idx" ON "DoubtThread"("studentId");

-- CreateIndex
CREATE INDEX "DoubtThread_batchId_visibility_idx" ON "DoubtThread"("batchId", "visibility");

-- CreateIndex
CREATE INDEX "DoubtMessage_threadId_createdAt_idx" ON "DoubtMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectBrief_status_publishAt_idx" ON "ProjectBrief"("status", "publishAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBriefTarget_briefId_batchId_key" ON "ProjectBriefTarget"("briefId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBriefTarget_briefId_studentId_key" ON "ProjectBriefTarget"("briefId", "studentId");

-- CreateIndex
CREATE INDEX "WorkspaceProject_ownerId_idx" ON "WorkspaceProject"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFile_projectId_path_key" ON "WorkspaceFile"("projectId", "path");

-- CreateIndex
CREATE INDEX "ProjectSubmission_studentId_idx" ON "ProjectSubmission"("studentId");

-- CreateIndex
CREATE INDEX "ProjectSubmission_briefId_status_idx" ON "ProjectSubmission"("briefId", "status");

-- CreateIndex
CREATE INDEX "ClassSession_batchId_startsAt_idx" ON "ClassSession"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "Attendance_studentId_idx" ON "Attendance"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_studentId_key" ON "Attendance"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "FollowUpNote_studentId_createdAt_idx" ON "FollowUpNote"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainerFeedback_studentId_createdAt_idx" ON "TrainerFeedback"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "PlacementInterview_studentId_idx" ON "PlacementInterview"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementReview_studentId_key" ON "PlacementReview"("studentId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Announcement_batchId_publishedAt_idx" ON "Announcement"("batchId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE INDEX "FileObject_assignmentId_idx" ON "FileObject"("assignmentId");

-- CreateIndex
CREATE INDEX "FileObject_submissionId_idx" ON "FileObject"("submissionId");

-- CreateIndex
CREATE INDEX "FileObject_doubtMessageId_idx" ON "FileObject"("doubtMessageId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentTarget" ADD CONSTRAINT "AssignmentTarget_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionHistory" ADD CONSTRAINT "SubmissionHistory_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTarget" ADD CONSTRAINT "AssessmentTarget_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTarget" ADD CONSTRAINT "AssessmentTarget_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTarget" ADD CONSTRAINT "AssessmentTarget_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingCase" ADD CONSTRAINT "CodingCase_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingJob" ADD CONSTRAINT "GradingJob_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "AttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeCaseResult" ADD CONSTRAINT "CodeCaseResult_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "AttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeCaseResult" ADD CONSTRAINT "CodeCaseResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CodingCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeDraft" ADD CONSTRAINT "CodeDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRun" ADD CONSTRAINT "CodeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtThread" ADD CONSTRAINT "DoubtThread_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtThread" ADD CONSTRAINT "DoubtThread_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtThread" ADD CONSTRAINT "DoubtThread_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtThread" ADD CONSTRAINT "DoubtThread_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtThread" ADD CONSTRAINT "DoubtThread_projectBriefId_fkey" FOREIGN KEY ("projectBriefId") REFERENCES "ProjectBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtThread" ADD CONSTRAINT "DoubtThread_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtMessage" ADD CONSTRAINT "DoubtMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DoubtThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubtMessage" ADD CONSTRAINT "DoubtMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBriefTarget" ADD CONSTRAINT "ProjectBriefTarget_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ProjectBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBriefTarget" ADD CONSTRAINT "ProjectBriefTarget_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBriefTarget" ADD CONSTRAINT "ProjectBriefTarget_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ProjectBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFile" ADD CONSTRAINT "WorkspaceFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkspaceProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ProjectBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpNote" ADD CONSTRAINT "FollowUpNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpNote" ADD CONSTRAINT "FollowUpNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerFeedback" ADD CONSTRAINT "TrainerFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerFeedback" ADD CONSTRAINT "TrainerFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementInterview" ADD CONSTRAINT "PlacementInterview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementInterview" ADD CONSTRAINT "PlacementInterview_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementReview" ADD CONSTRAINT "PlacementReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementReview" ADD CONSTRAINT "PlacementReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_doubtMessageId_fkey" FOREIGN KEY ("doubtMessageId") REFERENCES "DoubtMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
