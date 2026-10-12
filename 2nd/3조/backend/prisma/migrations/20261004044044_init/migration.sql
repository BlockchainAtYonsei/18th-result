-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ACCOUNT_CREATED', 'DEPOSIT', 'PROPOSAL_CREATED', 'PROPOSAL_APPROVED', 'THRESHOLD_REACHED', 'EXECUTION_REQUESTED', 'EXECUTION_BLOCKED', 'PROPOSAL_EXECUTED');

-- CreateTable
CREATE TABLE "account_metadata" (
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "creation_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_metadata_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "proposal_metadata" (
    "account_address" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipient_label" TEXT,
    "memo" TEXT,
    "creation_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_metadata_pkey" PRIMARY KEY ("account_address","proposal_id")
);

-- CreateTable
CREATE TABLE "wallet_profile" (
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_profile_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" BIGSERIAL NOT NULL,
    "account_address" TEXT NOT NULL,
    "proposal_id" TEXT,
    "type" "ActivityType" NOT NULL,
    "actor" TEXT,
    "tx_hash" TEXT,
    "block_number" BIGINT,
    "log_index" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_metadata_creation_tx_hash_key" ON "account_metadata"("creation_tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_metadata_creation_tx_hash_key" ON "proposal_metadata"("creation_tx_hash");

-- CreateIndex
CREATE INDEX "activity_account_address_created_at_idx" ON "activity"("account_address", "created_at");

-- CreateIndex
CREATE INDEX "activity_account_address_proposal_id_created_at_idx" ON "activity"("account_address", "proposal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "activity_tx_hash_log_index_key" ON "activity"("tx_hash", "log_index");

-- AddForeignKey
ALTER TABLE "proposal_metadata" ADD CONSTRAINT "proposal_metadata_account_address_fkey" FOREIGN KEY ("account_address") REFERENCES "account_metadata"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_account_address_fkey" FOREIGN KEY ("account_address") REFERENCES "account_metadata"("address") ON DELETE CASCADE ON UPDATE CASCADE;
