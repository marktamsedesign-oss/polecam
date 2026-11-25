# Working with Claude on G-eSAA

How a change gets from a Claude session to the testers, and then to the users. Claude follows these steps in every session.

## The branches

| Branch | For | A push to it |
|---|---|---|
| `main` | Users | builds the Android APK and updates the website |
| `beta` | Testers | builds the beta APK, then updates the website's `/beta/` copy |
| `claude/…` | Claude's working branch for one session | builds nothing |

Each Claude session gets its own working branch (its name starts with `claude/`). Changes stay there until the owner says where they go.

A push that changes only `.md` files, `maps/`, `tests/`, `tools/` or `.gitignore` builds no APK (so no new release). A push to `main` always updates the website, even then.

## The steps

1. **Start from beta.** Claude makes its working branch a copy of the latest `beta`.
2. **Make the changes.** Claude prepares the changes as separate files first (a copy of the branch outside the repository folder, and a patch per change) and changes nothing in the repository until the owner agrees.
3. **Review.** Claude shows the owner what changed and how it was checked (`python3 tests/run_all.py`, or the quick tests: `node --test tests/*.test.cjs tests/*.spec.cjs`; on GitHub: Actions → Tests → Run workflow).
4. **"Push to beta."** Only when the owner says so. Claude gets the latest `beta` first, puts its changes on top of anything uploaded in the meantime, and pushes. The beta APK and the `/beta/` site build for testing.
5. **Test.** The owner tests the beta APK and the `/beta/` site.
6. **"Push to main."** Only when the owner says so, after testing. Claude carries the same changes over to the latest `main`, leaving out what belongs only to beta (such as the `-b…` part of `VERSION` in `sw.js`), and pushes. The users' APK and website build.

## Rules

- Never push to `main` or `beta` unless the owner has said so for that change.
- Never force-push `main` or `beta`, and never delete a branch without asking.
- After editing any app file, change `VERSION` in `sw.js` (see the note at the top of that file) so phones and browsers fetch the new files. Ask the owner which number to use.
- On beta the number appears twice: `VERSION` in `sw.js` (`…-b4.5`) and `APP_BETA` in `app.js` (`'4.5'`, the "BETA 4.5" badge in the app). Change both together. `APP_BETA` is shown only in the beta app, so it can stay as it is on `main`.
- The files in `.github/workflows/` are the same on `beta` and `main` (each workflow runs only from its own branch). A change to one goes to both. If GitHub refuses Claude's push of a workflow file, the owner uploads it on GitHub instead.
- A new app file is added in three places: `SHELL` in `sw.js` (the website's offline copy), and the `cp` line of both APK workflows. The APK workflows check this and stop if a file is missing.
- Keep usage down: don't read the very large files (`app.js`, `index.html`, `dxftpl.js`, `README.md`) in full. Search them and read only the parts the task needs.
- This repository is public. Never commit the owner's reference drawings, templates or other confidential files; keep notes about them instead. Private test inputs go in `tests/private/`, which `.gitignore` keeps out.

## Work in progress

- Splicing details (single line diagram and detailed, Access OSP and Broadband): in the beta app as the Ask & Draw page (`vendor/splice/splice.html`, opened from the Drawing). `vendor/splice/README.md` holds what was learned from the owner's reference drawings and the plan.
