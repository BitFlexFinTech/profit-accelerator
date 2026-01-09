-- Phase 8: Add status column to positions table for tracking open/closing/closed states

-- Add missing status column to positions table
ALTER TABLE positions 
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';

-- Add index for fast status queries
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);

-- Add check constraint for valid statuses
ALTER TABLE positions 
  ADD CONSTRAINT chk_positions_status 
  CHECK (status IN ('open', 'closing', 'closed'));