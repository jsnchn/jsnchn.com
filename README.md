# jsnchn.com

Personal website built with [buntastic](https://github.com/jsnchn/buntastic).

## Development

```bash
bun install
bun run dev
```

Visit `http://localhost:3000` to see the site.

## Building

```bash
bun run build
```

Output goes to `dist/`.

## Publishing

The site is deployed to GitHub Pages from the `gh-pages` branch.

To publish after making changes:

```bash
bun run build
git add dist/
git commit -m "Update dist"
git subtree push --prefix dist origin gh-pages
```

Then in GitHub Settings → Pages, select the `gh-pages` branch and root folder.
