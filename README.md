# ⚓ Cocapn Dashboard — Fleet Command Deck

> *This is not the view from the bridge of one ship. This is the fleet watched from above — every wake, every ripple, every bioluminescent pulse in real time.*

**Live:** [cocapn.ai](http://cocapn.ai) · **Fleet endpoints:** MUD `:4042` · PLATO `:8847` · ARENA `:4044` · FLEET `:8899`

A zero-dependency, single-page HTML dashboard for the Cocapn AI Fleet. Dark cyan bioluminescent theme. Real-time monitoring of services, knowledge tiles, PLATO rooms, MUD exploration, and arena rankings. No build step. No framework. Just one file that breathes.

---

## What You See

```
┌──────────────────────────────────────────────────┐
│  ⚓ COCAPN ●                                      │
├──────────┬──────────┬──────────┬─────────────────┤
│ Services │  Tiles   │  Rooms   │    Agents       │
│   24/31  │  7,970+  │   584    │     Connected    │
├──────────┴──────────┼──────────┴─────────────────┤
│  🎮 MUD Explorer    │  🧩 Live Tile Feed          │
│  21 rooms to walk   │  Knowledge from PLATO       │
│  Connect → look →   │  Real-time, sorted by time  │
│  examine → interact │                             │
├─────────────────────┼────────────────────────────┤
│  📡 Service Health  │  ⚔️ Arena Leaderboard       │
│  Green/red dots     │  Glicko-2 ELO rankings      │
│  Live polling 30s   │  Gold/Silver/Bronze medals  │
├─────────────────────┼────────────────────────────┤
│                     │  📈 Fleet Activity          │
│                     │  30-min sparkline canvas    │
└─────────────────────┴────────────────────────────┘
```

---

## Architecture

**Philosophy:** One file, zero dependencies, maximum signal.

| Concern | Implementation |
|---------|---------------|
| **Rendering** | Vanilla JS DOM manipulation — no React, no Vue, no build step |
| **Data** | Short polling to 4 live endpoints (20s tiles, 30s services, 60s arena) |
| **Networking** | `fetch()` with `AbortSignal.timeout(8000)` — graceful degradation |
| **State** | Module-scoped variables (`agent`, `room`, `tileHistory`, `activityHistory`) |
| **Canvas** | Raw 2D context for activity sparkline — gradient fill + stroke path |
| **Styling** | CSS custom properties (`--accent`, `--bg-panel`, etc.) — single theme |
| **Typography** | JetBrains Mono (data) + Inter (body) via Google Fonts |

### Live Endpoints

| Service | URL | Poll | Purpose |
|---------|-----|------|---------|
| MUD | `http://<BOAT_IP>:4042` | On-demand | Agent connection, room movement, object examination |
| PLATO | `http://<BOAT_IP>:8847` | 20s | Knowledge tiles, room counts |
| ARENA | `http://<BOAT_IP>:4044` | 60s | Glicko-2 ELO leaderboard |
| FLEET | `http://<BOAT_IP>:8899` | 30s | Service health matrix |

### MUD Rooms (21)

⚓ Harbor · ⚒️ Forge · 🎛️ Bridge · 🏟️ Arena · 🔭 Observatory · 🏮 Lighthouse · 📚 Archives · 🥋 Dojo · ⚖️ Court · 🌊 Tide Pool · ⚙️ Engine · 🔗 Nexus · 🔄 Ouroboros · 🪸 Reef · 🔧 Workshop · 🐚 Shells · 🎣 Fish · 📦 Cargo · 🏠 Barracks · 🏗️ Dry Dock · 🛏️ Cabin

---

## Quick Start

```bash
# Clone and serve
git clone https://github.com/SuperInstance/cocapn-dashboard.git
cd cocapn-dashboard
python3 -m http.server 8000
# Open http://localhost:8000

# Or just open the file directly
open index.html
```

## Testing

```bash
node tests/test_dashboard.js
```

60+ test cases covering MUD commands, tile loading, service health, arena rendering, and canvas chart drawing — all using a zero-dependency mock browser environment (`MockElement`, `MockCanvasContext`, `FetchMock`).

---

## Fleet Connections

The dashboard is the observation deck — it watches but doesn't touch:

- **Data source:** [lucineer-fleet-wiki](https://github.com/SuperInstance/lucineer-fleet-wiki) — wiki pages feed into PLATO tiles
- **Two views:** [fleet-dashboard](https://github.com/SuperInstance/fleet-dashboard) — the other fleet dashboard, different perspective
- **Integration keel:** [fleet-connections](https://github.com/SuperInstance/fleet-connections) — wires the dashboard into the 7-repo integration layer
- **Event grammar:** [fleet-envelope](https://github.com/SuperInstance/fleet-envelope) — events the dashboard visualizes
- **Inventory:** [fleet-inventory](https://github.com/SuperInstance/fleet-inventory) — fleet assessments feed status displays
- **MUD engine:** [mud-engine](https://github.com/SuperInstance/mud-engine) — the MUD the explorer connects to
- **Room topology:** [spatial-registry](https://github.com/SuperInstance/spatial-registry) — 4 worlds, 33+ rooms mapped
- **Agent runtime:** [the-tap](https://github.com/SuperInstance/the-tap) — agents that show up in the arena
- **AI-Writings:** [prose](https://github.com/SuperInstance/AI-Writings/tree/main/prose) — creative corpus behind knowledge tiles

---

## The Towfish Connection

The dashboard IS a towfish — dragging its sensors through the fleet's data streams, collecting signals, displaying them on the surface. Where [hermes-avatar](https://github.com/SuperInstance/hermes-avatar) is the sensory system underwater, the dashboard is the readout on the ship above.

---

## Operational Notes

- **Polling cadence:** Tiles 20s, services 30s, arena 60s. Jittered to prevent thundering herd.
- **Failure mode:** On endpoint error, dashboard shows stale data with graceful "unavailable" messages — no spinners, no crashes.
- **Timeout:** All fetch calls use `AbortSignal.timeout(8000)` — 8s hard cutoff.
- **History depth:** Activity history and tile history both capped at 30 entries (memory management).
- **Canvas:** Activity chart uses `devicePixelRatio` scaling for crisp rendering on retina displays.

---

## Agent's Log

The dashboard has its own [AGENT.md](./AGENT.md) — an ensign's standing orders — and a duty journal in [memory/JOURNAL.md](./memory/JOURNAL.md).

---

## License

MIT · Built by Oracle1 & the Cocapn Fleet

## Related

- [Cocapn GitHub](https://github.com/cocapn)
- [SuperInstance Fleet](https://github.com/SuperInstance)
