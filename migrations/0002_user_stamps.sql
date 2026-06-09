-- Stamps: the per-user OWNED set. Stamp definitions live client-side as a crumb (stamps.json) +
-- a server copy (data/stamps.json) for award validation; only ownership is stored here.
-- Composite PK (userId, stamp). See SPEC_stamps.md.

CREATE TABLE IF NOT EXISTS `user_stamps` (
  `userId` INT(11) NOT NULL,
  `stamp` INT(11) NOT NULL,
  `recv` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`, `stamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Per-user earned stamps';
