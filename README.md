# scratch-cli
A CLI tool for users who want to publish Scratch projects entirely from the command line.

## Account details

After `scc login`, run `scc account` to view details for the active Scratch account. To view another user's public profile, use `scc user --user <username>`.

## Profiles and public lists

`scc profile` shows the logged-in user's public profile details, including "About me", "What I'm working on", featured project, and recent activity. Use `--user` to view another user's public profile without logging in. Use `--list` to see the available sections without making a request.

```bash
scc profile
scc profile projects
scc profile --user griffpatch
scc profile --list
scc profile projects --user griffpatch
scc profile favorites --user griffpatch --limit 20 --offset 20
scc profile studios --user griffpatch
scc profile followed-studios --user griffpatch
scc profile following --user griffpatch
scc profile followers --user griffpatch
scc profile comments --user griffpatch --page 2
```

Without `--user`, the logged-in account is used. The former `scc profile griffpatch projects` syntax also works. Lists use `--limit` (1–40, default 10) and `--offset` (default 0). Comments use `--page` (default 1) instead. `studios` means studios the user curates; `followed-studios` means studios the user follows. These commands only read information.

## Explore Scratch

```bash
scc explore project                    # Trending projects
scc explore project --mode popular     # Popular projects
scc explore project --category animations
scc explore project --mode popular --category games
scc explore studio --mode popular      # Popular studios
scc explore project --limit 20 --offset 20
```

`--limit` accepts 1–40 results (default 10). `--offset` skips results (default 0).
For projects, `--category` accepts `all` (default), `animations`, `art`, `games`, or `music`.

## Notifications

After `scc login`, view notifications for the active Scratch account:

```bash
scc notifications
scc notifications --limit 20 --offset 20
```

`scc messages` is an alias. Viewing notifications does not mark them as read.
