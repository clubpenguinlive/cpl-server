-- Clans/clubs: first-class in-game community groups.
-- clubs: one row per club; tag is the 3-4 char bracket label shown in chat.
-- club_members: many-to-many; a user can only be in one club at a time (enforced app-side and by
-- the unique index on userId).

CREATE TABLE IF NOT EXISTS `clubs` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(32) NOT NULL,
  `tag` VARCHAR(4) NOT NULL,
  `leaderId` INT(11) NOT NULL,
  `xp` INT(11) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `tag` (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='In-game clubs';

CREATE TABLE IF NOT EXISTS `club_members` (
  `clubId` INT(11) NOT NULL,
  `userId` INT(11) NOT NULL,
  `role` ENUM('leader','officer','member') NOT NULL DEFAULT 'member',
  `joinedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clubId`, `userId`),
  UNIQUE KEY `userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Club membership';
