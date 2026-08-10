# Cocapn Dashboard — Tests

> *Sea trials for the command deck.*

Zero-dependency Node test suite — no mocha, no jest, no chai. Just `assert` and a hand-built mock browser.

---

## Architecture

The tests construct a complete simulated browser environment from scratch:

| Mock | Purpose |
|------|---------|
| `MockElement` | DOM elements with `appendChild`, `querySelector`, `textContent`, `innerHTML`, canvas `getContext`, event listeners |
| `MockDocument` | `getElementById`, `createElement`, `registerElement` for pre-registering dashboard elements |
| `MockCanvasContext` | Records all canvas operations (`beginPath`, `fill`, `stroke`, `arc`, etc.) for assertion |
| `FetchMock` | Route-based fetch mocking with `when(url, response, status)` — prefix matching for query strings |

## Coverage

| Suite | Tests | What It Covers |
|-------|-------|---------------|
| `out()` | 3 | DOM append, CSS classes, special characters |
| `quickCmd()` | 1 | Input setting + clearing |
| `api()` | 4 | JSON parsing, HTTP errors, network failures, AbortSignal |
| `connectMUD()` | 6 | Agent name generation, room state, UI updates, connection failure |
| `moveRoom()` | 3 | Connection requirement, room update, error display |
| `execCmd()` | 14 | Command routing (`look`, `go`, `examine`, aliases), empty input, fallback |
| `loadTiles()` | 8 | Tile rendering, sorting, counting, history tracking, limits |
| `loadServices()` | 7 | Health counting, HTML rendering, error handling, activity history |
| `loadArena()` | 6 | Leaderboard rendering, ELO bars, medals, empty state, error handling |
| `drawChart()` | 4 | Canvas operations, DPR scaling, edge cases (equal values, <2 points) |
| Integration | 3 | Connect→look, connect→move→examine, unique agent names |
| Constants | 4 | Endpoint URL verification |

```bash
node tests/test_dashboard.js
```

---

## Related

- [Dashboard README](../README.md)
- [Dashboard source](../index.html)
- [Dashboard agent](../AGENT.md)
