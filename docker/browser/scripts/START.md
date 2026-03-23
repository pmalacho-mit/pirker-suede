# `start.js` – Launch Chromium

```bash
./scripts/start.js                          # default headless on :9222
./scripts/start.js --port 9333              # custom CDP port
./scripts/start.js --user-data-dir /data    # persistent profile
```

Starts headless Chromium with remote debugging enabled. The process is detached so you can keep using the shell.
