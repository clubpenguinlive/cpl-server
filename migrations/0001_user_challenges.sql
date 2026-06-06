-- Daily challenges: per-user progress. The day's SET of 3 challenges is derived deterministically
-- from the date (no table needed for definitions); only per-user PROGRESS is stored here.
-- Composite PK (userId, day, challengeId). See SPEC_daily_challenges.md.

CREATE TABLE IF NOT EXISTS `user_challenges` (
  `userId` INT(11) NOT NULL,
  `day` DATE NOT NULL,
  `challengeId` INT(11) NOT NULL,
  `progress` INT(11) NOT NULL DEFAULT 0,
  `claimed` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`userId`, `day`, `challengeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Per-user daily-challenge progress';
