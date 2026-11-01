# Taylor — Resume AI

A local-first web app that tailors your **LaTeX resume to each job description** for
better ATS keyword alignment. Paste a JD (or a public job URL), pick how aggressive you
want to be, and it runs a cascade of agents — extract keywords → gap analysis → tailor →
LaTeX compile → hard one-page gate → ATS coverage score → "what changed" summary — then
hands you a compiled, single-page PDF plus the editable `.tex`.

Meet **Taylor** (yes, a pun on _tailor_), the friendly assistant that drives the UI.

> **Runs on your machine.** Your files stay local, but when AI is on, the JD and your resume
> content go to the AI provider you choose. Use a local model or **Demo mode** to avoid that.

---

## Demo

**Landing page** — a clean slate, ready for a job description.

![Taylor landing page](images/taylor-ai-home.png)

**Taylor in action** — fields filled in, tailoring a resume to the pasted JD.

![Taylor in action](images/taylor-ai-in-action.png)

---

## Features

- **JD in, tailored resume out** — paste JD text or fetch a public posting by URL.
- **Four tailoring modes** — Aggressive Fabrication, Middle Ground (default), Mild Nudging, Use Original (zero AI / zero tokens).
- **Multi-master archetypes** — keep separate bases (ML / DS / SWE / custom). Cascade, PDF, and tracker all use the selected type.
- **Keyword controls** — pin must-keep terms, force-inject stack keywords (aggressive mode), and an adjustable ATS coverage target.
- **Hard one-page enforcement** — compiles the real PDF and measures the true page count; no character-count guessing.
- **Smart location handling** — remaps the header location based on the JD (e.g. West Coast → San Jose, East Coast → New York).
- **In-browser LaTeX editor** — tweak the `.tex` and recompile without leaving the app.
- **Revert to baseline** — rebuilds MetaData for all types and reloads the selected archetype’s frozen template.
- **Application tracker** — explicit **I Applied ✓** saves job metadata, “what changed” trace, and tailored `.tex` (no PDF) to a local store; browse everything on `/applications`.
- **Pace & analytics** — today / week (Mon–Sun) / month / lifetime vs goals, status funnel, 14-day sparkline, breakdowns by resume type / role / mode.
- **Export pack** — download the tailored PDF + `.tex` together.
- **Dark / light mode** and a playful, responsive UI.
- **Demo mode** — explore the whole UI with zero API key using local mocks.

---

## Prerequisites

1. **Node.js 20 or newer** — check with `node --version`.
2. **Tectonic** (the LaTeX engine used to compile PDFs). This is **required to generate
   PDFs** — the app starts and runs without it, but any compile step will fail until it's
   installed. See [Installing Tectonic](#installing-tectonic) below.
3. *(Optional)* An **API key** from Gemini, Claude, OpenAI, or another provider for real AI
   tailoring (a local model needs no key). Without one, the app runs in demo mode with local mocks.

---

## Quick start

```bash
git clone <your-repo-url>
cd Tailor_Resume_AI

# 1. install deps
npm install

# 2. set up env
cp .env.example .env.local      # Windows PowerShell: copy .env.example .env.local
#   then edit .env.local (see "Configuration" below)

# 3. install the LaTeX engine (see "Installing Tectonic")

# 4. run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Out of the box, `DEMO_MODE=true` means you can click around and run the cascade with
mocked AI immediately. To get a real compiled PDF you still need Tectonic installed.

---

## Example walkthrough:

1. **Install** Node 20+, then Tectonic ([Installing Tectonic](#installing-tectonic)).
2. **Clone →** `npm install` → copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_RESUME_OWNER_NAME` to your name. Optionally set `LLM_PROVIDER`, add that provider's key, and set `DEMO_MODE=false` for real AI (otherwise explore in demo mode).
4. **Put your resume in** — replace `data/template_ml.tex` (importantly, keep the section markers like `SKILLS_START` / `EXPERIENCE_START`). Optional: add `template_ds.tex` / `template_swe.tex` for other archetypes.
5. Run `npm run dev` → open [http://localhost:3000](http://localhost:3000).
6. Click **Make MetaData** — builds `master_resume_<type>.json` for every `template_*.tex`. Check the per-type results panel (✓ / ✗). Do this once whenever you change a template.
7. Paste a JD (or a public job URL) → **Parse** — controls prefill; **Resume type** auto-picks when a matching archetype exists (`data_science→ds`, `ml→ml`, `swe→swe`, else `ml`).
8. Pick a mode → **Run cascade** → wait for the PDF / “what changed”.
9. Happy with it? Click **I Applied ✓** → open **My Applications** (`/applications`) to see the row, expandable trace, and (once you have apps) the pace analytics strip.

**If something fails**

| Symptom | Fix |
|---|---|
| Cascade says no master for `ds` / type shows “no metadata yet” | Click **Make MetaData**, then retry. |
| “Tectonic failed” / no PDF | Install Tectonic; run `tectonic --version`. First compile needs network for packages. |
| AI looks generic / mocked | Set your provider's key and `DEMO_MODE=false`, restart `npm run dev`. |
| Wrong output filename | Set `NEXT_PUBLIC_RESUME_OWNER_NAME`, restart dev server. |

---

## Installing Tectonic

Tectonic is a self-contained LaTeX engine. The app looks for it in this order:

1. `tools/bin/tectonic.exe` (Windows) or `tools/bin/tectonic` (macOS/Linux)
2. a `tectonic` command on your system `PATH`

So you can either drop the binary in `tools/bin/` or install it globally — either works.
The **first compile downloads TeX packages once** (network required); later compiles are fast.

**Option A — download the binary into `tools/bin/`**

Grab the matching build from the
[Tectonic releases page](https://github.com/tectonic-typesetting/tectonic/releases),
unzip it, and place the executable at `tools/bin/tectonic` (or `tools/bin/tectonic.exe`
on Windows). `tools/bin/` is gitignored, so it stays local to your machine.

**Option B — install globally (on your PATH)**

```bash
# macOS (Homebrew)
brew install tectonic

# Windows (winget)
winget install TectonicTypesetting.Tectonic

# Arch Linux
sudo pacman -S tectonic

# Cargo (any platform with Rust)
cargo install tectonic
```

Verify:

```bash
tectonic --version
```

> Prefer classic LaTeX? You can install MiKTeX / TeX Live instead, but the app's compile
> path is built for Tectonic. See `tools/README.md` for notes.

---

## Browser extension

The `extension/` folder runs Taylor next to the job posting you're reading. It's a front end
for the local app, because tailoring and PDF compiles need Node, Tectonic, and your `data/`
folder — so `npm run dev` must be running on port 3000. That's also why it needs a desktop
browser: phones and tablets can't reach the app on `localhost`.

| Browser | Opens as | Status |
|---|---|---|
| Chrome 121+, Brave | Side panel | Tested |
| Edge, Vivaldi, other Chromium browsers | Side panel | Should work, not tested |
| Opera, Arc | Side panel or its own window | Not tested |
| Firefox 140+ | Sidebar | Passes Mozilla's linter, not yet run |
| Safari | Its own window | Packaged with Xcode, not yet run |

**Install**

Start the app with `npm run dev`, then:

- **Chromium browsers:** open `chrome://extensions` (`edge://extensions` in Edge), turn on
  **Developer mode**, click **Load unpacked**, and pick the `extension/` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and
  pick `extension/manifest.json`. Firefox removes it on restart. To keep it, sign it through
  [addons.mozilla.org](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).
- **Safari:** needs Xcode. Run the command below, set your team under **Signing & Capabilities**,
  and run the app. Then turn on **Allow Unsigned Extensions** in Safari's Developer settings and
  enable Taylor under **Settings > Extensions**.

  ```bash
  xcrun safari-web-extension-converter extension --project-location build/safari --app-name Taylor --macos-only
  ```

Click the Taylor toolbar icon to open it. Pin the icon first if your browser hides it.

**Log in to an AI provider (optional)**

Click **AI login**, pick a provider, and paste your API key. Choose **Other** for OpenRouter,
Groq, Ollama, or any service with an OpenAI-style API. Taylor makes one small real call to check
the key, which costs a tiny amount of credit, then uses that provider for everything, including
when you open the app in a tab. **Log out** returns to `.env.local`.

- **API keys only.** A ChatGPT or Claude subscription doesn't include API access, so you need a
  key from the provider's developer console, billed separately.
- **Where the key goes:** it's saved in plain text in `.llm-login.json` in the project folder
  (gitignored, readable only by your user), the same trust level as `.env.local`. It's only ever
  sent to the provider you chose. It isn't stored in the browser.
- A login overrides `LLM_PROVIDER`, `LLM_MODEL_*`, and `DEMO_MODE`. One model is used for every
  step; leave it blank for the provider's defaults.

**Upload a resume (optional)**

Click **Upload resume**, choose **New resume** or an existing one to replace, and pick your file.
Taylor saves it as `data/template_<name>.tex`, reads it with **Make MetaData** (one AI call), and
selects it.

- **LaTeX only.** Tailoring edits your `.tex` source directly, so PDF and Word files can't be used.
  The file must include `% === SKILLS_START ===` / `% === SKILLS_END ===` and
  `% === EXPERIENCE_START ===` / `% === EXPERIENCE_END ===` around those sections, or it's refused.
- **A new resume stays selected** until you pick another, for every job. Replacing Machine Learning,
  Data Science, or Software Engineering keeps the usual behaviour: Taylor switches among those three
  by job type, so the sample resumes can still be used unless you replace all three.
- **Replacing** keeps one backup of the old resume at `data/template_<name>.backup.tex` and
  `data/master_resume_<name>.backup.json`.
- **In demo mode** the file is saved but not read. Log in to an AI provider and click **Make
  MetaData** before tailoring it.
- **New resumes are gitignored,** along with what's built from them. **Replacing a sample is
  different:** the samples are tracked in git, so your details show up as a change to that file and
  `git add .` would include them. Use **New resume** if you might share this repo.

**Track applications in a Google Sheet (optional)**

Each person needs their own Google OAuth client, once:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable
   the **Google Sheets API**.
2. Set up the OAuth consent screen as **External**, add the scope
   `https://www.googleapis.com/auth/spreadsheets`, then **publish** the app. While it stays in
   Testing, Google ends your login every 7 days. You'll see an "unverified app" warning when you
   log in, which is expected for your own client: choose **Advanced**, then continue.
3. Create an OAuth client of type **Web application** with the redirect URI
   `http://localhost:3000/api/google-login/callback`.
4. Put its ID and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then
   restart the app.

Then click **Google Sheet > Log in with Google** in the extension, go back to the panel, paste the
link to a Google Sheet you can edit, and click **Use this sheet**. Taylor fills it with the
applications you've already saved.

- **Your existing data is safe.** Taylor writes to the tab in your link only if columns A to L are
  empty or already hold Taylor's header. Otherwise it adds a **Taylor Applications** tab and leaves
  your tabs alone.
- **The app is the source of truth.** Saving or updating an application changes its row, and this
  runs whether you use the extension or a tab. Edits to Taylor's columns in the sheet are overwritten
  by the next sync, and rows you delete from the sheet come back if the application is still in the
  app. Add your own columns to the right of **ID**: they're kept, and you can sort and rename the
  tab freely.
- **Taylor never deletes rows.** Deleting an application in the app leaves its row in the sheet as
  history, though it stops updating. Remove the row yourself if you don't want it.
- **If you change the header row or insert a column** among Taylor's, syncing stops and the panel
  says why, so nothing gets overwritten. Restore the header to carry on.
- **If a sync fails,** the panel shows why and the next sync catches up. **Sync now** retries.
- **Access:** Google has no narrower permission for a sheet you link, so the login lets Taylor read
  and edit **all of your Google Sheets**. It only ever opens the one you link, and it can't reach
  your other Drive files.
- **Where the login goes:** the refresh token is saved in plain text in `.google-login.json` in the
  project folder (gitignored, readable only by your user), and isn't stored in the browser.
- **To change sheets,** paste a different link. The old sheet keeps its rows but stops updating.

**Use it**

Open a job posting, then choose one:

- **Create resume** reads the job and builds the tailored PDF in one click, with no copy and
  paste. The panel shows progress and an **Open PDF** link when it's done. It uses the mode set
  in the app (Middle Ground by default) and never submits anything to the job site.
- **Use this page** only fills in **Job input**, so you can review it and adjust the controls
  before running the cascade yourself.

Both read the text you've selected if there is any, otherwise the job description on the page.
**Create resume** stops without using AI credits if the page doesn't look like a job posting.

The first click asks for access to all sites, so the panel can read postings on any board,
including those embedded in an iframe. Pages are only read when you click the button. The text
goes to your local app, then to your AI provider when you click **Parse**. If you decline, the panel still works with pasted JDs.

Closing the panel discards unsaved work, such as a tailored result you haven't marked
**I Applied ✓**. Use **Open in tab** for the full-width layout.

---

## Configuration

All config lives in `.env.local` (copied from `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_RESUME_OWNER_NAME` | No | Your name, used only to label output files → `Resume_{Your_Name}_{Company}.pdf`. Blank = `Resume_{Company}.pdf`. |
| `LLM_PROVIDER` | No | `gemini` (default), `anthropic`, `openai`, or `openai-compatible`. |
| `LLM_MODEL_PRO` | No | Model for heavier steps. Blank = the provider's default. |
| `LLM_MODEL_FLASH` | No | Model for lighter steps. Blank = the provider's default. |
| `GEMINI_API_KEY` | No* | Key for `gemini`. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `ANTHROPIC_API_KEY` | No* | Key for `anthropic` (Claude). |
| `OPENAI_API_KEY` | No* | Key for `openai` (ChatGPT models). |
| `LLM_BASE_URL` | No* | API URL for `openai-compatible` (OpenRouter, Groq, DeepSeek, Ollama, and others). |
| `LLM_API_KEY` | No | Key for `openai-compatible`. Local servers usually don't need one. |
| `DEMO_MODE` | No | `true` uses local mocks; `false` calls your provider. |
| `TRACKER_STORE` | No | `local` (default). `redis` / `supabase` are placeholders for a future cloud swap. |
| `GOOGLE_CLIENT_ID` | No | OAuth client for Google Sheet tracking from the extension. |
| `GOOGLE_CLIENT_SECRET` | No | Secret for that client. |
| `NEXT_PUBLIC_TRACKER_DAILY_GOAL` | No | Daily app goal for `/applications` analytics (default `5`). Set `0` to hide. |
| `NEXT_PUBLIC_TRACKER_WEEKLY_GOAL` | No | Weekly goal, Mon–Sun weeks (default `25`). |
| `NEXT_PUBLIC_TRACKER_MONTHLY_GOAL` | No | Monthly goal (default `100`). |
| `NEXT_PUBLIC_TRACKER_LIFETIME_GOAL` | No | Lifetime goal (default `0` = none). |

\* If `DEMO_MODE` is unset and the selected provider's key (or `LLM_BASE_URL`) is empty, the app
stays in demo mode. `.env.example` sets `DEMO_MODE=true`, so change it to `false` to use AI.

**Default models**

| `LLM_PROVIDER` | Pro | Flash |
|---|---|---|
| `gemini` | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `anthropic` | `claude-sonnet-5-5` | `claude-haiku-5-5` |
| `openai` | `gpt-6-luna` | `gpt-6-luna` |
| `openai-compatible` | none, set `LLM_MODEL_PRO` | none, set `LLM_MODEL_FLASH` |

To use Claude Haiku for every step, for example:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
LLM_MODEL_PRO=claude-haiku-5-5
LLM_MODEL_FLASH=claude-haiku-5-5
DEMO_MODE=false
```

Existing `.env.local` files keep working: `GEMINI_MODEL_PRO` and `GEMINI_MODEL_FLASH` are still read.

---

## Use your own resume

This repo ships with a sample `data/template_ml.tex` and `data/master_resume_ml.json`, which contains Lorem Ipsum text.
To make it yours:

1. Replace `data/template_ml.tex` with your own LaTeX resume, **keeping the section markers**
   (e.g. `SKILLS_START` / `SKILLS_END`, `EXPERIENCE_START` / `EXPERIENCE_END`) so the
   agents know which regions they may edit.
2. Set `NEXT_PUBLIC_RESUME_OWNER_NAME` in `.env.local`.
3. Click **Make MetaData** in the app (or `POST /api/metadata`) to rebuild
   `data/master_resume_ml.json` from your template. This is what the tailoring agents read.

Generated artifacts land in `runs/` (gitignored). Use **Revert TeX** to reset the working
copy back to your baselines at any time — your `data/template_*.tex` files are never modified.

### Multiple resume archetypes (multi-master)

You can keep several base resumes side by side — one LaTeX template per archetype:

- `data/template_ml.tex`  → Machine Learning
- `data/template_ds.tex`  → Data Science
- `data/template_swe.tex` → Software Engineering
- `data/template_<slug>.tex` → any custom archetype (`<slug>` = `[a-z0-9_]+`)

Adding a new type is just **drop a `template_<slug>.tex` + run Make MetaData**. Types are
discovered dynamically (no code change). **Make MetaData** parses every
`template_<slug>.tex` independently into its own `master_resume_<slug>.json` (uses more
tokens, but it's a one-time local write). Pick the active archetype with the **Resume type**
dropdown in the controls; after **Parse** it's auto-set from the detected role family
(`ml→ml`, `data_science→ds`, `swe→swe`, other→`ml`) when that template exists, else falls
back to `ml`. The cascade, one-page gate, PDF, and tracker all use the selected type.
See [MultiMaster.MD](./MultiMaster.MD) for the design.

### Application tracker

After a cascade you’re happy with, click **I Applied ✓**.
Taylor saves a local record under `data/applications/`:
company, role, mode, resume type, keywords, ATS coverage, “what changed”, and the tailored
`.tex` source. Open **My Applications** to browse the table, re-download/compile past TeX,
and check pace analytics. See [Tracker.MD](./Tracker.MD) for the schema and adapter plan.

---

## How it works

```
JD (paste or URL)
   └─> Parse ──> suggestions prefill the controls (+ resume type)
                    └─> Run cascade (selected archetype only):
                          1. Extract keywords
                          2. Gap analysis
                          3. Tailor (edits structured JSON, not raw .tex)
                          4. Render template + Tectonic compile
                          5. Hard one-page gate (measures real page count)
                          6. ATS keyword coverage score
                          7. "What changed" summary
                    └─> Compiled PDF + editable .tex in runs/
                    └─> optional: I Applied ✓ → local tracker + /applications
```

Agents edit **structured JSON**, which is deterministically rendered into a frozen LaTeX
template — keeping output stable and one-page-safe. See [GAMEPLAN.md](./GAMEPLAN.md) for
the full design.

---

## Troubleshooting

- **"Tectonic failed" / no PDF** — Tectonic isn't installed or isn't found. Run
  `tectonic --version`; if it fails, revisit [Installing Tectonic](#installing-tectonic).
  The first compile also needs internet to fetch TeX packages.
- **First compile is slow** — expected; Tectonic caches packages after the first run.
- **AI results look generic / mocked** — you're in demo mode. Set your provider's key
  and `DEMO_MODE=false` in `.env.local`.
- **No master / “no metadata yet” for a resume type** — click **Make MetaData** after
  adding or changing `data/template_<type>.tex`. The UI shows per-type ✓ / ✗ results.
- **Cascade crashes mid-compile on a new type** — usually a missing or wrong-shaped
  `master_resume_<type>.json`. Re-run Make MetaData with a real API key (not demo stub)
  for that archetype.
- **`npm install` or build errors** — confirm Node 20+ (`node --version`).
- **Wrong name on output files** — set `NEXT_PUBLIC_RESUME_OWNER_NAME` and restart `npm run dev`.

---

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

---

## Privacy note

The app and your files run locally. When `DEMO_MODE=false`, **the job description and your
resume content** are sent to the provider set by `LLM_PROVIDER`, under that provider's data
terms. To keep everything on your machine, use demo mode or a local model such as Ollama. Tracker records live under
`data/applications/` (gitignored). If you log in to Google from the extension, each application's
company, role, status, location, job URL, notes, and similar details are also copied to the sheet you
linked; the resume source isn't. Anyone that sheet is shared with can see them. If you fork this repo publicly, remember to replace
the sample resume in `data/` with your own (and don't commit personal contact details you
don't want public).
