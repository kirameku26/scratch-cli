# scratch-cli
A CLI tool for users who want to publish Scratch projects entirely from the command line.

## Getting started and command guide

```bash
scc                             # Show commands grouped by purpose
scc help project                # Show project actions, options, and examples
scc help studio
scc help project edit           # Show only this action's details
scc project edit --help         # Equivalent action help
scc help user reply
scc login --username your_name
scc user                        # View the active user
scc project list                # View your projects
scc logout
```

| Purpose | Commands |
| --- | --- |
| Login and account settings | `login`, `logout`, `session`, `account` |
| Browse Scratch | `home`, `search`, `explore`, `user`, `forum`, `legal` |
| Projects and studios | `project`, `studio` |
| Messages | `notifications` (alias: `messages`) |
| Teacher classes | `class` |
| Setup and tools | `python`, `completion`, `version`, `help` |

Use `scc <command> --help` or `scc help <command>` for details. Bare `project`,
`studio`, `class`, and `forum` commands also show help. Project, studio, and class
operations use `<action> [id]`; user operations use `[username] [action]`, with
`--section` selecting information to read. `account` changes the active account's
settings; `user` reads profiles and interacts with other users.

For `project`, `studio`, `user`, `account`, `class`, `forum`, and `notifications`, use
`scc help <command> <action>` to see the action's description, required arguments,
applicable options, login/confirmation requirements, and an example. You can also
append `--help` or `-h` to the usual action syntax, such as
`scc user griffpatch reply --help`. Viewing help does not execute the action.

`scc logout` sends Scratch's logout request and removes the saved CLI login after
confirmation from the response. If Scratch is unavailable, `scc logout --local`
removes only the saved CLI login without a network request. These commands do not
log out browser sessions or guarantee that every copy of a session token is revoked.

Network failures, rate limits, and invalid responses are reported as errors, not
as a logged-out state. Authentication requests time out after 15 seconds; Scapi
operations have a 30-second deadline (with a 35-second process limit). Failed
requests are not retried automatically. If a change times out, check whether it
completed on Scratch before running it again.

## Users, profiles, and public lists

`scc user` is the main command for user information. Without a username it uses
the logged-in account. The `details` section requires a login; public sections
can be viewed without logging in when a username is specified.

```bash
scc user
scc user griffpatch
scc user griffpatch --section about
scc user --list
scc user griffpatch --section projects
scc user griffpatch --section favorites --limit 20 --offset 20
scc user griffpatch --section studios
scc user griffpatch --section followed-studios
scc user griffpatch --section following
scc user griffpatch --section followers
scc user griffpatch --section comments --page 2
```

The default section is `details`. Both user details and `about` display the
featured project, its profile-specific label, and up to 10 recent activities.
When signed in, they also show whether the active account follows that user,
including your own profile, as `Yes`, `No`, or `Unknown` instead of `Self`.
When your own profile has no follow button, the CLI checks one following page
(up to 40 users). If that page is full and does not include you, the state remains
`Unknown`. An unavailable relationship is also shown as `Unknown`. `about` includes "About
me" and "What I'm working on". Lists use `--limit`
(1–40, default 10) and `--offset` (default 0). Comments use `--page` (default 1)
instead. `studios` means studios the user curates; `followed-studios` means
studios the user follows. These commands only read information.

Use `scc user` for the active user, `scc user <username> --section about` for a
profile, and `scc account <action>` for account changes. The former bare
`scc account`, `scc profile`, and `scc user --user` / `-u` forms are no longer supported.

## Project and user interactions

Changes use the active Scratch account; public project information can be read without login:

```bash
scc project love 123
scc project unlove 123
scc project favorite 123
scc project unfavorite 123
scc project comment 123 --text "Nice project!"
scc project reply 123 --comment-id 456 --text "Thanks!"
scc project details 123
scc project comments 123 --limit 20 --offset 0
scc project remixes 123
scc project studios 123
scc project reactions 123
scc project list --visibility all
scc project list --visibility shared --page 2
scc project list --visibility notshared
scc project list --visibility trashed
scc project create --title "New project"
scc project remix 123 --title "My remix"
scc project share 123
scc project unshare 123
scc project settings 123 --comments off
scc project settings 123 --comments on
scc project trash 123
scc project restore 123
scc project edit 123 --title "New title" --instructions "How to play" --credits "Thanks"
scc project thumbnail 123 --file thumbnail.png
scc project download 123 --output project.sb3
scc project upload --file project.sb3 --title "New project"
scc project upload 123 --file project.sb3
scc project report 123 --category 6 --reason "Explanation"
scc project report-comment 123 --comment-id 456
scc user griffpatch follow
scc user griffpatch unfollow
scc user griffpatch comment --text "Hello!"
scc user griffpatch reply --comment-id 456 --text "Hello again!"
scc user griffpatch report-comment --comment-id 456
scc user griffpatch delete-comment --comment-id 456
scc user griffpatch report --report-type icon
```

Comments are public. Comment text must contain 1–500 characters. The CLI reports
the active account used for each successful action and never places session
credentials in child-process arguments.

`download` saves projects as `.sb3` by default, converting Scratch 1/2 data
offline without running scripts. Use `--format original` to keep the source
format, or `--format sb|sb2|sb3` to choose an output format. Upgrades from
Scratch 1 to 2/3 and 2 to 3 are supported; downgrades are not. The default
filename is the site's project title with the selected extension.
`--output` takes priority. Invalid filename characters are replaced, long titles
are shortened, and empty or unavailable titles fall back to the project ID.
If `--output` uses `.sb`, `.sb2`, or `.sb3`, that extension must match `--format`.
A saved login is used when available, including for your unshared projects.
The destination directory must already exist; replacing a local file requires
interactive confirmation. Symbolic-link destinations are rejected.
Conversion rejects unsupported blocks/extensions rather than silently dropping
them. SVG appearance may differ from the old editor; choose `original` if you
need the unconverted source. Conversion has a separate 120-second timeout.

```bash
scc project download 600                      # Convert to sb3 (default)
scc project download 600 --format original    # Keep Scratch 1 .sb
scc project download 600 --format sb2         # Convert Scratch 1 to .sb2
```

`upload` without an ID creates an unshared project. With an ID, it replaces only
the code, costumes, and sounds of a project owned by the confirmed account;
the title and sharing settings are preserved. Back up first: the CLI cannot undo
an upload. All uploads require confirmation; overwrites require `overwrite <id>`.
`--title` is available only for new uploads.

Uploads support `.sb3` only; downloads also support `.sb` and `.sb2`.
Transfers are limited to 50 MiB per file, 100 MiB expanded,
200 unique assets, 10 MiB per asset, and 5 MiB of project JSON, with a 120-second
network timeout. Assets are transferred sequentially without automatic retries.
An interrupted upload may leave uploaded assets or a completed project change;
check Scratch before retrying.

## Paging through lists

Offset-based lists accept `--page` (1-based, default 1). The start position is
`offset + (page - 1) * limit`. For example, `--limit 10 --page 2` skips 10 items;
adding `--offset 5` skips 15. This applies to search, explore, home, user public
lists, project comments/remixes/studios, studio projects, and notifications.
Only the requested range is fetched, without loading preceding pages.

```bash
scc search project "game" --limit 10 --page 2
scc user griffpatch --section projects --limit 20 --page 3
scc project comments 123 --limit 20 --page 2
```

Notifications without `--limit` use the unread count (up to 40) as page size;
specify `--limit` for stable paging. Native page-based lists (user comments,
My Stuff, studio lists, classes, and forums) keep their existing page semantics.
Studio activity has no offset support and does not accept `--page`.

Studio management also uses the active account:

```bash
scc studio create
scc studio accept-invite 123
scc studio promote 123 --user curator_name
scc studio transfer 123 --user new_owner
scc studio details 123
scc studio projects 123 --limit 20 --offset 0
scc studio activity 123 --limit 20
scc studio role 123
scc studio settings 123 --comments off
scc studio settings 123 --open-to-all on
scc studio edit 123 --title "New title" --description "New description"
scc studio thumbnail 123 --file thumbnail.png
scc studio add-project 123 --project https://scratch.mit.edu/projects/456/
scc studio list --type owned
scc studio follow 123
scc studio invite 123 --user curator_name
scc studio remove-curator 123 --user curator_name
scc studio managers 123
scc studio curators 123
scc studio comments 123
scc studio comment 123 --text "Welcome!"
scc studio remove-project 123 --project 456
scc studio report 123 --report-type title
scc studio delete 123
```

Profile and account settings can be changed through the unified account command:

```bash
scc account edit-profile --about "Hello!" --working-on "A game"
scc account edit-profile --featured-project 123
scc account settings --country Japan --state Tokyo
scc account settings --cat-ears on
scc account settings --comments off
scc account settings --comments on
scc account scratcher-status
scc account become-scratcher
scc account change-email --email new@example.com
scc account change-password
scc account delete-account
scc account delete-account --delete-projects
```

Scratch teacher accounts can manage one page of classes, students, or class
studios at a time:

```bash
scc class list --type all --page 1
scc class details 123
scc class students 123 --page 1
scc class studios 123 --page 1
scc class create --title "My class"
scc class edit 123 --status "Working on games"
scc class edit 123 --open off
scc class create-studio 123 --title "Class projects"
```

All Scratch changes—including creation, remixing, invitation acceptance,
comments, likes, favorites, and following/unfollowing—require interactive
confirmation showing the active account and target or changes. Public comment
text is shown before posting. There is no confirmation-bypass option.
Account deletion requires typing
`delete <account>` and then reads the password without echoing it. Studio
ownership transfer, class closure, and password changes require similarly
specific typed confirmation. Password changes clear the saved login after
success. In a non-interactive environment these actions stop without changing Scratch data.
Reports and account deletion should be used only when genuinely intended.
Project comments, remix lists (not the discontinued remix tree), studios containing
a project, studio projects, and studio activity are public reads. Lists accept
`--limit` (1–40, default 20); all except activity also accept `--offset` (default 0).
Project comments show top-level comments and IDs; replies are not fetched automatically.
`project reactions` and `studio role` require login but do not change data or prompt
for confirmation. Reactions show your love/favorite status; role shows manager,
curator, invitation, and following status.

Use `settings --comments on|off` for a project, studio, or the active account's
profile. Studio `settings --open-to-all on|off` controls whether everyone can add
projects. Studio settings accept one flag at a time; account `--comments` cannot
be combined with other settings. Where Scratch only provides a toggle, the CLI
reads the current state, skips matching settings, and verifies any change. Unknown
states stop the action. Failed verification is reported as an error, with no
automatic retry. Do not assume an error means no change occurred on Scratch.

Creating the dedicated Python environment and installing or upgrading Scapi also
require confirmation showing the affected environment path.

## Forums

```bash
scc forum                       # Show forum help without a request
scc forum categories            # List categories and their IDs
scc forum topics 18 --page 1     # List topics in category 18
scc forum topic 123              # Show topic information
scc forum posts 123 --page 2     # Read one page of a topic
scc forum post 456               # Read a single post
scc forum source 456             # Show a post's BBCode source
scc forum follow 123             # Requires login and confirmation
scc forum unfollow 123           # Requires login and confirmation
scc help forum posts
```

Reads are public and do not use the saved login. `topics` takes a category ID;
`topic`, `posts`, `follow`, and `unfollow` take a topic ID; `post` and `source`
take a post ID. `topics` and `posts` accept `--page` (default 1) and `--limit`
(1–40, default 20), which caps the items displayed from that single page. They
do not fetch additional pages to reach the limit. Post bodies are displayed as
plain text; `source` displays BBCode. Following and unfollowing require
confirmation of the active account and topic. Creating topics, posting replies,
and editing posts are not supported.

## Scratch home page

```bash
scc home                         # List available sections without a request
scc home whats-happening         # Requires login
scc home news
scc home featured-projects
scc home featured-studios
scc home design-studio
scc home following-loves         # Requires login
scc home most-loved
scc home most-remixed
scc home newest-projects
scc home following-projects      # Requires login
scc home following-studio-projects # Requires login
scc home viewed-projects         # Requires login
```

`home` is also available as `frontpage`. Results support `--limit` (1–40,
default 10) and `--offset` (default 0). Public sections do not require a login.
`whats-happening`, `following-loves`, `following-projects`,
`following-studio-projects`, and `viewed-projects` use the active account.

## Explore Scratch

```bash
scc explore project                    # Trending projects
scc explore project --mode popular     # Popular projects
scc explore project --category animations
scc explore project --mode popular --category games
scc explore studio --mode popular      # Popular studios
scc explore project --limit 20 --offset 20
scc explore project --language ja
```

`--limit` accepts 1–40 results (default 10). `--offset` skips results (default 0).
For projects, `--category` accepts `all` (default), `animations`, `art`, `games`, or `music`.
`--language` selects the Scratch result language (`en` by default).

## Search Scratch

```bash
scc search project "platformer"                 # Trending search results
scc search project "platformer" --mode popular  # Popular search results
scc search project "ゲーム" --language ja
scc search studio "animation" --mode popular
```

`--mode` accepts `trending` (default) or `popular`. `--limit` accepts 1–40
results (default 10), and `--offset` skips results. `--language` selects the
Scratch result language (`en` by default).

## Notifications

After `scc login`, view notifications for the active Scratch account:

```bash
scc notifications
scc notifications --limit 20 --offset 20
scc notifications count
scc notifications read
```

Without `--limit`, the list requests the unread count, capped at 40. `count`
only displays the unread count. `read` marks all messages as read after an
interactive confirmation. `scc messages` is an alias.

## Scratch policies

```bash
scc legal community-guidelines
scc legal terms
```

These commands print the official Scratch document title and URL.
