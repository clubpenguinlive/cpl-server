# Dependency overrides

The `overrides` block in `package.json` forces resolution of transitive
dependencies. Every entry is a liability: npm holds the package at whatever the
override says, so a pinned package stops receiving security updates until
someone edits this file by hand.

Two rules follow from that.

1. An override is a last resort. If the parent's declared range already reaches
   a patched version, delete the override and let npm resolve normally.
2. Never use an exact version. Use a caret range so patch releases still flow in.
   An exact pin is how `socket.io-parser` sat on a vulnerable 4.2.6 for three
   months while both parents declared `~4.2.4` and would have reached the
   patched 4.2.7 on their own.

Before adding an override, check what the parent declares:

```
npm ls <package>
npm why <package>
```

If the parent range covers a patched version, there is nothing to override.

## Current overrides

### `sequelize` > `uuid`: `11.1.1`

Scoped to sequelize only. Sequelize 6.37.8 declares `uuid: ^8.3.2`, three majors
behind the `uuid@^11` we depend on directly. Pinning it inside the sequelize
scope keeps one uuid copy in the tree without forcing uuid 8 on our own code.

This one is deliberate rather than advisory driven, so it is scoped instead of
global. Removable when sequelize declares a uuid range that includes 11.x.

### `ws`: `^8.21.0`

GHSA-96hv-2xvq-fx4p (memory exhaustion from small fragments, high) affects
`ws >=8.0.0 <8.21.0`. Two parents resolve below that floor on their own:

- `pm2@7.0.1` declares `ws` as an exact `8.20.0`
- `socket.io-adapter` declares `~8.17.1`

Neither range can reach 8.21.0, so npm cannot fix this without the override.
`engine.io` and `engine.io-client` declare `~8.21.0` and are fine unaided.

Remove this when pm2 ships a release declaring `ws >=8.21.0` (pm2 7.0.4 already
does) and socket.io-adapter widens past `~8.17.1`. Check with
`npm why ws` after a pm2 bump.

### `js-yaml`: `^4.3.2`

GHSA-2883-xcg3-v3hh (merge keys with empty sources escape the
`maxTotalMergeKeys` cap, high) affects `js-yaml >=4.0.0 <4.3.2`. `pm2` declares
`js-yaml` as an exact `4.1.1`, which sits inside that range and cannot move.

The range stays on 4.x deliberately. js-yaml 5.x is a breaking change that pm2
is not written against, and forcing it would trade a CPU-exhaustion bug for a
runtime failure in the process manager.

Remove this when pm2 declares `js-yaml >=4.3.2`. Note that pm2 7.0.4 still
declares an exact `4.3.1`, so bumping pm2 alone does not clear this one.

## Removed overrides

These nine were added in `0239c57` (2026-06-25) as exact pins. All were verified
obsolete on 2026-09-15: each parent's declared range now reaches a version at or
above the relevant advisory's patched version without help, so the pins were
only blocking future updates.

| Package | Was pinned | Parent range | Advisory floor |
| --- | --- | --- | --- |
| `lodash` | `4.18.1` | sequelize `^4.17.21` | 4.18.0 |
| `dottie` | `2.0.7` | sequelize `^2.0.6` | 2.0.7 |
| `systeminformation` | `5.31.7` | pm2-sysmonit `^5.7` | 5.31.7 |
| `validator` | `13.15.26` | sequelize `^13.9.0` | 13.15.22 |
| `jws` | `3.2.3` | jsonwebtoken `^3.2.2` | 3.2.3 |
| `follow-redirects` | `1.16.0` | extrareqp2 `^1.14.0` | 1.16.0 |
| `socket.io-parser` | `4.2.6` | socket.io `~4.2.4` | 4.2.7 |

`basic-ftp` was pinned to `6.0.0` while its only parent, `get-uri`, declares
`^5.0.2`. That override forced a major version the parent was never written
against, and it was never needed: the last basic-ftp advisory
(GHSA-rpmf-866q-6p89) is patched in 5.3.1, which is the top of the 5.x line and
inside get-uri's range. Removing the override moves basic-ftp from 6.0.0 to
5.3.1. The version number goes down, the advisory exposure does not change, and
the tree stops violating get-uri's declared range.

`ws` and `js-yaml` were kept and relaxed from exact to caret.
