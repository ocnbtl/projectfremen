# GitHub Accounts and Repo Workflow

## Can You Edit pngwn Repos from @ocnbtl?

Yes, if permissions are granted.

You have two practical options:

1. Add `@ocnbtl` as collaborator (or team member) to `pngwn-zero` repos.
2. Keep using `@pngwn-zero` for those repos and `@ocnbtl` for others via SSH host aliases.

## Recommended Setup

Use one local machine config with two SSH identities and host aliases:

1. `github.com-ocnbtl` -> key/account for `@ocnbtl`
2. `github.com-pngwn-zero` -> key/account for `@pngwn-zero`

Then each repo remote URL points to the correct alias.

## Important Clarification

1. Commit author identity and push account identity are separate.
2. You can set local git `user.name` / `user.email` per repo while still pushing through one SSH identity.
3. Best practice is to keep both aligned to avoid confusion in history.

## Current Target Repos

1. `pngwn-zero/pngwn-web` (website)
2. `pngwn-zero/pngwn` (mobile app, currently out of scope)
3. `ocnbtl/projectpint`
4. `ocnbtl/projectfremen` (to create)

## Immediate Repo Actions

1. Create `projectfremen` on `@ocnbtl`.
2. Initialize local git in `/Users/ocean/Documents/Project Fremen`.
3. Push the current plan/docs and dashboard scaffold as first commit.
