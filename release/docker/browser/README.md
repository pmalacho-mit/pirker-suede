# Browser Control – Headless CDP Toolkit

A Docker image that runs headless Chromium with a suite of Node.js scripts for
controlling it via the Chrome DevTools Protocol (CDP).

## Quick Start

```bash
# Build
docker build -t browser-control .

# Run interactively
docker run -it --rm -p 9222:9222 browser-control

# Inside the container:
./scripts/start.js
./scripts/nav.js https://example.com
./scripts/screenshot.js
```

## Devcontainer Networking (Important)

If your app server (for example Vite) runs inside a VS Code devcontainer, a
separate browser-control container usually cannot reach it via
`host.docker.internal`.

Why:

- Your normal OS browser can reach forwarded ports from VS Code.
- A sibling Docker container does not automatically use VS Code port-forwarding.

Recommended run mode for browser-control in devcontainer workflows:

1. Start your app normally inside the devcontainer (for example `npm run dev`).
2. Run browser-control with the _same network namespace_ as the devcontainer.
3. Navigate to `http://127.0.0.1:<your-app-port>` from browser-control scripts.

Example:

```bash
# From inside the devcontainer shell, hostname is typically the container id.
DEVCONTAINER_ID="$(hostname)"

docker run -it --rm \
	--network "container:${DEVCONTAINER_ID}" \
	browser-control

# Inside browser-control container:
./scripts/start.js
./scripts/nav.js http://127.0.0.1:4317
```

This mirrors production usage where browser-control and your app must share a
reachable network path without relying on editor-level forwarding.

## Scripts

All scripts live in `./scripts/` and are self-contained CLI tools.

[](./scripts/START.md)

[](./scripts/NAV.md)

[](./scripts/EVAL.md)

[](./scripts/SCREENSHOT.md)

[](./scripts/CLICK.md)

[](./scripts/TYPE.md)

[](./scripts/WAIT.md)

[](./scripts/DOM.md)

[](./scripts/TABS.md)

[](./scripts/WATCH.md)

[](./scripts/LOGS-TAIL.md)

[](./scripts/NET-SUMMARY.md)

## Typical Workflow

```bash
# 1. Start browser
./scripts/start.js

# 2. Start background logging (in another shell / with &)
./scripts/watch.js &

# 3. Navigate
./scripts/nav.js https://example.com

# 4. Inspect the page
./scripts/dom.js
./scripts/dom.js --inputs

# 5. Interact
./scripts/type.js '#search' 'docker headless' --enter
./scripts/wait.js '.results'
./scripts/click.js '.results a:first-child'

# 6. Screenshot the result
./scripts/screenshot.js -o /tmp/result.png

# 7. Check network
./scripts/net-summary.js
```

## Environment Variables

| Variable     | Default             | Description                |
| ------------ | ------------------- | -------------------------- |
| `CHROME_BIN` | `/usr/bin/chromium` | Path to browser binary     |
| `CDP_PORT`   | `9222`              | CDP debugging port         |
| `LOG_DIR`    | `/tmp/browser-logs` | Where watch.js writes logs |

## Extending

All scripts use `chrome-remote-interface` and share helpers from `lib.js`.
To add a new script, import `connect` and `listTargets` from `./lib.js` and
you have a CDP client with Runtime, Page, DOM, and Network already enabled.
