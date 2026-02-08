---
description: Check, register, and validate MCP servers
argument-hint: [--test] [--fix]
allowed-tools: Bash, Read, Glob, mcp__*
---

# /cs-mcp

<role>
You are an MCP server administrator that checks, registers, and validates Model Context Protocol servers. You ensure all configured servers are properly registered and connected for use by Claude Sentient commands.
</role>

<task>
Check MCP server status, auto-register missing servers from settings.json, and validate connections. Report which servers are available for /cs-loop and other commands.
</task>

## Arguments

| Arg | Purpose |
|-----|---------|
| `--test` | Test each connected server with a real call |
| `--fix` | Auto-register servers found in settings.json but not in `claude mcp` |

<steps>
## Execution Flow

### Phase 1: Gather State

**1.1 Read settings.json for configured servers:**

```bash
# Locations to check (in order)
$HOME/.claude/settings.json     # User-level
.claude/settings.json           # Project-level
```

Parse the `mcpServers` key to find configured servers.

**1.2 Check registered servers:**

```bash
claude mcp list
```

**1.3 Check enabled plugins:**

Look for `enabledPlugins` in settings.json.

### Phase 2: Compare & Report

Build status table showing configured vs registered vs connected.

### Phase 3: Auto-Register (if --fix)

If `--fix` is passed, register missing servers using `claude mcp add`.

**CRITICAL: Windows requires `cmd /c` wrapper**

On Windows, npx must be run through cmd.exe. Use `add-json` with the correct structure:

**Windows registration (REQUIRED on Windows):**
```bash
# Without env vars
claude mcp add-json <name> '{"command":"cmd","args":["/c","npx","-y","<package>"]}'

# With env vars
claude mcp add-json <name> '{"command":"cmd","args":["/c","npx","-y","<package>"],"env":{"KEY":"value"}}'
```

**Linux/Mac registration:**
```bash
# Without env vars
claude mcp add <name> -- npx -y <package> [args]

# With env vars (use add-json for reliability)
claude mcp add-json <name> '{"command":"npx","args":["-y","<package>"],"env":{"KEY":"value"}}'
```

**Detect platform:**
- Windows: Check if `$env:OS` contains "Windows" or `uname` fails
- Use `cmd /c` wrapper on Windows, direct `npx` on Linux/Mac

### Phase 4: Test Servers (if --test)

Test each connected server with a real API call.

### Phase 5: Summary

Report what's available for /cs-loop.
</steps>

<output_format>
## Status Table

```
MCP Server Status:
┌──────────────┬────────────┬────────────┬───────────┬─────────────────────────┐
│ Server       │ Configured │ Registered │ Connected │ Action Needed           │
├──────────────┼────────────┼────────────┼───────────┼─────────────────────────┤
│ context7     │ plugin     │ plugin     │ ✓         │ None                    │
│ github       │ ✓          │ ✗          │ ✗         │ Run --fix to register   │
│ memory       │ ✓          │ ✗          │ ✗         │ Run --fix to register   │
└──────────────┴────────────┴────────────┴───────────┴─────────────────────────┘
```

## Test Results (--test)

```
Test Results:
  ✓ context7: Returned 5 React libraries
  ✗ claude-in-chrome: Extension not connected
  ✓ github: Authenticated as <username>
  ✓ memory: Read/write successful
```

## Summary

```
[MCP] Summary:
  Configured: 5 servers
  Plugins:    2
  Registered: 4 servers
  Connected:  3 servers

[MCP] For /cs-loop:
  • Context7 available → Library docs will be auto-fetched
  • GitHub available → Can create PRs and issues
```
</output_format>

<context>
## Known Servers Reference

| Server | Package | Env Vars | Purpose |
|--------|---------|----------|---------|
| context7 | `@upstash/context7-mcp` | - | Library documentation |
| claude-in-chrome | Plugin | - | Browser automation |
| github | `@modelcontextprotocol/server-github` | GITHUB_TOKEN | GitHub API |
| memory | `@modelcontextprotocol/server-memory` | - | Key-value store |
| filesystem | `@modelcontextprotocol/server-filesystem` | - | File access |
| puppeteer | `@modelcontextprotocol/server-puppeteer` | - | Browser automation |
| postgres | `@modelcontextprotocol/server-postgres` | DATABASE_URL | PostgreSQL |
| brave-search | `@modelcontextprotocol/server-brave-search` | BRAVE_API_KEY | Web search |

## /cs-loop Integration

| Server | Phase | How /cs-loop Uses It |
|--------|-------|----------------------|
| **context7** | INIT | Scans imports, fetches library docs |
| **github** | INIT | Fetches issue details for referenced issues |
| **github** | COMMIT | Links commits to issues, offers PRs |
| **memory** | INIT | Checks for previous session state |
| **memory** | COMMIT | Saves session state for resumability |
| **puppeteer** | VERIFY | Screenshots web apps after UI changes |
</context>

<constraints>
- Always prefer `add-json` for servers with environment variables
- Do not store sensitive tokens in command output
- Report clearly what actions were taken
- Remind user to restart Claude Code after registering new servers
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Registering without --fix**: Don't auto-register servers unless the user explicitly passes `--fix`. Without the flag, only report status.

- **Exposing tokens**: Don't echo or log actual token values. Show `GITHUB_TOKEN: [set]` or `[not set]`, never the actual value.

- **Assuming connected = working**: Don't skip the `--test` verification. A server can be registered but misconfigured.

- **Forgetting restart reminder**: Always remind the user to restart Claude Code after registering new servers. Registrations don't take effect until restart.

- **Wrong registration method**: Don't use `claude mcp add -e` for environment variables—it has parsing bugs. Always use `claude mcp add-json` for servers with env vars.

- **Partial status**: Don't report only configured servers. Show the full picture: configured vs registered vs connected.
</avoid>

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server configured but not registered | Run `/cs-mcp --fix` |
| Server registered but not connected | Restart Claude Code |
| github auth fails | Check GITHUB_TOKEN env var |
| claude-in-chrome not connected | Open Chrome, check extension is active |
| puppeteer fails | May need Chrome/Chromium installed |
| filesystem access denied | Check path permissions |
