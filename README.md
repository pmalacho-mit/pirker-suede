# Pirker-suede

This repo is a [suede dependency](https://github.com/pmalacho-mit/suede).

To see the installable source code, please checkout the [release branch](https://github.com/pmalacho-mit/pirker-suede/tree/release).

## Installation

```bash
bash <(curl https://suede.sh/install-release) --repo pmalacho-mit/pirker-suede
```

<details>
<summary>
See alternative to using <a href="https://github.com/pmalacho-mit/suede#suedesh">suede.sh</a> script proxy
</summary>

```bash
bash <(curl https://raw.githubusercontent.com/pmalacho-mit/suede/refs/heads/main/scripts/install-release.sh) --repo pmalacho-mit/pirker-suede
```

</details>

## Sessions

Sessions are purely a message history. For each message we only need to preserve the content + they will be named with the model that produced them in the case of assistant messages.

Should prefix each message with their turn index.

example:

- 0-user.md
- 1-assistant-claude-4-opus.md

> NOTE: this should be named so that alphabetical sort of the messages in the session folder would also be (approximately)a chronological sort of the messages. If messages in the same turn are mis-ordered, that's not a problem, but we want to ensure that turns proceed in the correct order and thus need to adopt a numbering scheme that addresses issues around numerical sorting (e.g. 10 should come after 9, not before).

Sessions are to be written to the `.sessions` directory inside of the branch that the automata belongs to (assume a `root` location will be provided), so that session data can be preserved in the automata's branch.

Sessions will be identified by a guid (which is a random selection from the list of robot names ([`./release/api/utils/robots.ts`](./release/api/utils/robots.ts)) + a guid from `nanoid`).

Within `.sessions` the following will be created on behalf of the session:

- `.gitignore` (if it doesn't already exist) to ignore all files in the .sessions directory except for zip and json files that are immediate children of the `.sessions` directory (so that we can preserve session metadata and zip files, but ignore all files included within subfolders, including json files)
- `.gitattributes` (if it doesn't already exist) to indicate zip files should be tracked using git-lfs (since they will likely be large binary files that change on each message addition, and we don't want to bloat the git history with them). The .gitattributes file will include a line like `*.zip filter=lfs diff=lfs merge=lfs -text` to ensure that all zip files in the .sessions directory are tracked with git-lfs.
  - It can be assumed an early step of the process would have checked for git-lfs support and initialized it if necessary, so we can assume that git-lfs will be available for use in tracking the zip files.
- `<guid>/` folder to contain all messages (both `.md` and `.json`)
- `<guid>.zip` file that effectively contains an archive of the `<guid>/` folder, which can be used for downloading the session data without having to worry about the internal structure of the session folder. This zip file will be updated on each message addition to the session.
  - for performance reasons, the zip file will be added to one by one (instead of, say, re-zipping the entire folder on each message addition). This means that the zip file will be created on session initialization, and then on each message addition, the new message will be added to the existing zip file.
- `<guid>.json` file that contains metadata about the session, like the accumulated cost of the session, the branch + commit at time of creation (things like creation and modified time will be assumed to be extracted/extractable from the file attributes), as well as the last sent user message (to make identifying the session easier as a human). Also, it will include a reference to any 'parent' sessions if the session was created from another (with a reason, currently either 'copy' or 'compaction'). This file will be updated on each message addition to the session.

Events like 'session compaction' (when the message history gets to long for an LLM's context window) will actually trigger a new session to be created (and a reference to the old session will be included in the new session's metadata, as described above).

When continuing a session, the session's message history must be loaded and provided as context to the LLM, and new messages will be added to the session as the conversation continues. The turn index can be determined by looking at the existing messages in the session and incrementing from the highest turn index found (e.g. the turn index of the last written file + 1).

## Automata

Automata are directly tied to the git branch they are created for. When creating an automaton, a branch must be specified. This branch will be checked-out as a worktree within the current repository (worktrees will be stored at `.worktrees/<branch-name>`), and the automaton will operate within that worktree, meaning that all sessions created by the automaton will be stored within that branch's `.sessions` directory at the root of their worktree, and all file operations the automaton performs will be performed within that branch's worktree. A branch to checkout from can also be specified (e.g. the optional last parameter to `git worktree add`), and if not we fall back to the behavior of `git worktree add`.

An automaton is defined by the following static and dynamic properties:

- Static
  - branch (the branch the automaton is tied to and operates within)
  - root (the directory of the automaton's worktree (a folder within `.worktrees`), which will be where the automaton performs all file operations and where the .sessions directory it uses is located)
- Dynamic
  - "Agent" properties:
    - model
    - session
    - tools

Automata at any moment have the following (dynamic, meaning it can be changed) configuration:

- model (which will be used for all LLM calls the automata makes, and will be included in the naming of assistant messages in the session)
- session (which will be the active session that the automata is using to log its message history)
- tools

When creating an automata, the user has the option to specify a session to use, by either:

- creating a 'fresh' session, which will just be a new session with no messages in it
- copying an existing session, which will create a new session with the same messages as the existing session (this will be done by copying the messages over to a new session folder and zip file, and including a reference to the 'parent' session in the new session's metadata with a reason of 'copy')
- compacting an existing session, which will create a new session with a summarized version of the messages in the existing session (this will be done by summarizing the messages and including the summary as a system prompt in the new session, and including a reference to the 'parent' session in the new session's metadata with a reason of 'compaction')

At creation time, the automata will also be provided a series of 'skills' that can be leveraged (similiar to CLAUDE skills, this will live in a `.skills` folder at the root of the repository).

An automata can 'finish' when it has no more actions to take, and the user sends no follow-up messages. At this point the user (or the automata's manager, which could be another automata) can determine what to do. Either:

- Create a PR (necessary if the changes are to be merged back into the main branch)
- Merged to a different branch (could be useful in the case of a sub-automata that is created to perform a specific task, and then merged back into the parent automata's branch when finished)
- 'Disposed of' without merging (e.g. if the automata was created just to perform a specific task, and the changes it made don't need to be preserved). In the case, the automata's branch is still pushed (session data is automatically committed), but once pushed, the worktree can be removed.

In all cases, the automata's branch will be pushed, so that the session data and any file changes are preserved in the git history.

## System Assumptions

- zip
- git-lfs
