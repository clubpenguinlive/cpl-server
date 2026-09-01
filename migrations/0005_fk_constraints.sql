-- club_members, user_challenges, and user_stamps were created without a FK back to users, so a
-- deleted user can leave orphan rows behind in each. Clean up any orphans that already exist
-- (safe: these are join-table rows, not primary user data) before adding the constraint, then add
-- the FK with ON DELETE CASCADE so future user deletions clean these tables up automatically.

DELETE FROM `user_challenges` WHERE `userId` NOT IN (SELECT `id` FROM `users`);
DELETE FROM `user_stamps` WHERE `userId` NOT IN (SELECT `id` FROM `users`);
DELETE FROM `club_members` WHERE `userId` NOT IN (SELECT `id` FROM `users`);

ALTER TABLE `user_challenges`
  ADD CONSTRAINT `fk_user_challenges_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_stamps`
  ADD CONSTRAINT `fk_user_stamps_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `club_members`
  ADD CONSTRAINT `fk_club_members_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
