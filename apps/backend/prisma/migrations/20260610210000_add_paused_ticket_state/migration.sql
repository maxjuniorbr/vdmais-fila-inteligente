-- RE can pause her own ticket (she's not ready); ticket goes to the end of the
-- queue when resumed.
ALTER TYPE "TicketState" ADD VALUE IF NOT EXISTS 'PAUSED';
