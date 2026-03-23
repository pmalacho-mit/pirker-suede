# `eval.js` - Execute JavaScript

```bash
./scripts/eval.js 'document.title'
./scripts/eval.js 'document.querySelectorAll("a").length'
./scripts/eval.js 'await fetch("/api/status").then(r => r.json())'
echo 'complex_script()' | ./scripts/eval.js --stdin
./scripts/eval.js --target <tab-id> 'expression'
```

Runs in an async context so `await` is supported.
