-- Build the stricter index first so an environment with conflicting data keeps
-- the previous active-ticket protection if this statement fails.
CREATE UNIQUE INDEX "tickets_one_active_per_re_er_with_paused"
ON "tickets"("erId", "representativeId")
WHERE "state" IN ('WAITING', 'CALLING', 'IN_SERVICE', 'PAUSED');

DROP INDEX "tickets_one_active_per_re_er";

ALTER INDEX "tickets_one_active_per_re_er_with_paused"
RENAME TO "tickets_one_active_per_re_er";
