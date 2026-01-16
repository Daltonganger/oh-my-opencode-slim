# TLDR: What Was Slimmed Down

Quick summary of changes from the original `oh-my-opencode` to this lite fork.

## Annoyances Removed

| Annoyance | What It Did | Status |
|-----------|-------------|--------|
| **Forced TODO continuation** | Hooks like `todo-continuation-enforcer` that nagged you to complete tasks | Gone |
| **Aggressive retry loops** | `sisyphus-task-retry`, `ralph-loop` - wouldn't let things go | Gone |
| **Token usage paranoia** | `context-window-monitor`, `preemptive-compaction` - constantly tracking/compacting | Gone |
| **Session persistence** | Complex state saving between sessions you didn't ask for | Gone |
| **38 behavioral hooks** | Auto-injected behaviors modifying every interaction | All gone |

## Token Usage Reduction

| Component | Original | Lite | Reduction |
|-----------|----------|------|-----------|
| Orchestrator prompt | 1,485 lines | 67 lines | **95%** |
| Frontend agent prompt | 5,173 lines | 1,037 lines | **80%** |
| Explore agent prompt | 125 lines | 53 lines | **58%** |
| Total source files | 403 files | 56 files | **86%** |

## Features Axed

- **6 agents removed**: `metis`, `momus`, `prometheus-prompt`, `sisyphus`, `sisyphus-junior`, `orchestrator-sisyphus`
- **9 tools removed**: `call-omo-agent`, `interactive-bash`, `sisyphus-task`, `skill`, `skill-mcp`, etc.
- **16 features removed**: skill loaders, context injectors, toast managers, boulder state...
- **All 38 hooks**: The entire hooks system that modified behavior

## What's Left (the good stuff)

- **8 focused agents**: orchestrator, explore, librarian, oracle, frontend, document-writer, multimodal, code-simplicity-reviewer
- **3 MCPs**: websearch (Exa), context7, grep.app
- **Simple background tasks**: No complex async orchestration
- **Clean prompts**: Short, direct, non-aggressive

---

**Bottom line**: Went from a "helicopter parent" AI that wouldn't stop following up and tracking everything, to a straightforward assistant that does what you ask without the overhead. ~87% less code, ~95% shorter prompts on the orchestrator alone.
