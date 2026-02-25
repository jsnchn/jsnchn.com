# Agent Instructions

- You are allowed to commit and push changes once you are done.

## Communication

- Be concise and direct. Avoid unnecessary preamble or postamble.
- Answer in 1-3 sentences unless detail is explicitly requested.
- Ask for clarification when instructions are ambiguous.
- Proceed with reasonable assumptions when details are missing but task is clear.
- Only ask for approval before actions that are irreversible or high-impact (e.g., force pushes, destructive operations, installing packages, adding third-party integrations).

## Workflow

- Write concise commit messages focusing on what changed.
- Commit directly to main; skip pull requests.
- Only create branches when explicitly requested or for work tree style agentic workflows.

## Project-Specific

- Always develop against static files.
- Follow GitHub Pages deployment conventions for file organization.

## Publishing

The site is deployed to GitHub Pages from the `gh-pages` branch.

After making content or code changes:

1. Run `bun run build` to build to `dist/`
2. Push dist to gh-pages: `git subtree push --prefix dist origin gh-pages`
3. Deploy from the `gh-pages` branch in GitHub Settings → Pages
