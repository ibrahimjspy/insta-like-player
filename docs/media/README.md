# Screenshots & demo media

The main [README](../../README.md) references these files. Drop your captures
here using the **exact filenames** below and the README renders automatically.

| Filename | View | How to reach it | Suggested capture |
|----------|------|-----------------|-------------------|
| `feed.png` | For you feed (hero) | `/` → tap a video to pause and show chrome | Phone-style portrait, ~390×844 device frame |
| `search.png` | Search | `/search` → type a query, show platform pills + creator chips | Desktop window, ~1280×800 |
| `admin.png` | Admin dashboard | `/admin` | Desktop window, ~1280×800 |
| `collections.png` | Collections | `/collections` (or `/favorites`) | Desktop window, ~1280×800 |

Optional: `demo.gif` — a short screen recording of scrolling the feed. If you add
one, reference it as the hero in the README instead of `feed.png`.

## Capturing good screenshots

Everything is a dark, high-contrast theme, so clean framing matters more than color.

### 1. Seed a little realistic data first

Screenshots look best with a populated library. Import a small export and sync a
handful of reels (`npm run sync -- --limit 20`) so the feed, search, and stats
aren't empty.

### 2. The phone-style feed (`feed.png`)

The feed is designed portrait. Use the browser's device toolbar:

- Chrome/Edge: open DevTools (`Cmd+Opt+I`) → **Toggle device toolbar** (`Cmd+Shift+M`) → pick **iPhone 14 Pro**.
- Set zoom to 100% and DPR to 2 (or 3) for crisp retina output.
- Tap a video so the order bar / controls are visible, then capture.

### 3. Desktop views (`search.png`, `admin.png`, `collections.png`)

- Resize the window to a consistent width (~1280px). A tidy, repeatable size keeps the gallery uniform.
- Use the system capture tool:
  - **macOS:** `Cmd+Shift+4`, then press **Space** to capture just the browser window (gives a clean drop shadow). Or `Cmd+Shift+5` for more control.
  - **Linux:** GNOME Screenshot / Flameshot, window mode.
- Crop out browser chrome (URL bar, bookmarks) if you want a pure-app look — `Cmd+Shift+4` window mode already excludes the page chrome on macOS but includes the browser frame; crop after if desired.

### 4. A demo GIF (optional, high impact)

1. Record the feed scroll: **macOS** `Cmd+Shift+5` → record a small region for ~5–8s.
2. Convert to an optimized GIF with ffmpeg (`brew install ffmpeg`):

   ```bash
   ffmpeg -i recording.mov -vf "fps=15,scale=390:-1:flags=lanczos" -loop 0 demo.gif
   ```

   Or use [Gifski](https://gif.ski) for smaller, higher-quality output.
3. Keep it under ~5 MB so the README loads fast on GitHub.

### 5. Privacy check

These get committed publicly. Before saving:

- Blur or avoid real usernames/handles you don't want public.
- Make sure no cookies, tokens, file paths, or personal captions are visible.
