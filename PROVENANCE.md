# Where this code comes from, and how to check the dates

The competition's new-experience window opened on 24 Sep 2026. The author
states that everything here was written after that, on 10 and 11 Nov 2026.
GitHub's timestamps below show when the repositories were created and each
build was deployed; they prove when code was pushed, not when it was
written.

## Commit dates are not proof

Git commit dates are set by whoever makes the commit, so `git log` alone
proves nothing about when the code was written. The timestamps below are
recorded by GitHub itself, which the author can't backdate. Each line says
how to check it.

| What | GitHub's timestamp (UTC) | Same moment in the commit log (US Central, UTC−6) | How to check |
|---|---|---|---|
| The prototype's repository `chainwright/fade-abacus` created | 2026-11-10 23:20:07 | "Fade day 1" commit `7af31ef`, 17:19:50 | `gh api repos/chainwright/fade-abacus --jq .created_at` |
| This repository `chainwright/cover-desk` created | 2026-11-11 06:29:27 | "Cover day 1" commit `2abc761`, 00:28:50 | `gh api repos/chainwright/cover-desk --jq .created_at` |
| First GitHub Pages deploy of Cover (gh-pages `89486a4`) | 2026-11-11 06:30:34 | 00:30 | `gh api repos/chainwright/cover-desk/deployments --jq '.[] \| [.created_at, .sha]'` |
| Day-2 deploy (gh-pages `95b710f`, built from `9155473`) | 2026-11-11 07:23:58 | 01:23 | same call |
| Day-3 deploy (gh-pages `6a08219`, built from `2f1f81a`) | 2026-11-11 08:30:35 | 02:30 | same call |
| Day-4 deploy (gh-pages `6f3c214`, built from `80ebc13`) | 2026-11-11 09:40:22 | 03:40 | same call |
| Day-5 deploy (gh-pages `c1955a8`, built from `c90f3f6`) | 2026-11-11 11:20:56 | 05:20 | same call |
| Day-6 deploy (gh-pages `a9613e1`, built from `512a672`) | 2026-11-11 13:04:43 | 07:04 | same call |
| Day-7 deploy (gh-pages `3baf3c3`, built from `b117ac8`) | 2026-11-11 15:29:26 | 09:29 | same call |
| Day-7b deploy (gh-pages `2ec6d6d`, built from `83fa065`) | 2026-11-11 19:01:38 | 13:01 | same call |

GitHub adds every later push to `gh-pages` to the same list.

## The prototype

Cover was started by cloning the "Fade" desk prototype (an abacus on the
desk, pushed with a fingertip), so the first four commits in `git log`
(`7af31ef` … `2610fd1`, 10 Nov 2026) are the prototype's, kept with their
original dates. What Cover reused from it: the desk tap calibration, the
desk anchor, the fingertip contact rules and the tester log recorder
(`devlog/DAY1.md` lists them). The prototype's public repository is
https://github.com/chainwright/fade-abacus.

## What "day 1, day 2, …" means

The devlogs count build sessions, not calendar days. Each session ends with
a deploy (listed above) and an outside review (the reviews are not in this
repository); the next session fixes what the review
found. That is why Cover's "day 1" and "day 2" commits are 54 minutes apart
and the prototype's two days about 45 minutes apart.
