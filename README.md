# Viking Voyagers 16-Bit Lacrosse

A small, dependency-free top-down lacrosse game inspired by the basic movement and
pace of 16-bit hockey games. It uses plain HTML, CSS, JavaScript, and the Canvas API.

## Run locally

Open `index.html` directly, or run:

```bash
python3 -m http.server 8001
```

Then visit `http://127.0.0.1:8001`.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys | Move the highlighted Voyager |
| A with possession | Pass and switch control to the receiver |
| A without possession | Poke check |
| S with possession | Shoot |
| P | Pause or resume |
| R | Restart |

## Simplified gameplay

- Five players per team and no goalies.
- The Voyagers begin with possession instead of a draw.
- The conceding team receives possession after a goal.
- Field players cannot enter either protected crease.
- Poke checks can create loose balls; body checking is omitted.
- The team that did not touch the ball last receives it after an out-of-bounds play.
- AI players spread out on offense, match up on defense, pass, shoot, and poke check.

These mechanics are intentionally simplified for a short arcade game rather than a
complete officiating simulation.

## Rules source

Gameplay is informed by the
[USA Lacrosse 2025 Girls Youth Guidebook](https://www.usalacrosse.com/sites/default/files/documents/Rules/2025-Girls-Youth-Guidebook.pdf),
particularly its small-sided youth format, no-goalie option, protected goal circle,
and safe stick-checking emphasis.

## Repository structure

```text
lacrosse-game/
├── index.html
├── styles.css
├── game.js
├── README.md
└── .gitignore
```

No package manager, framework, build command, or external asset is required.
