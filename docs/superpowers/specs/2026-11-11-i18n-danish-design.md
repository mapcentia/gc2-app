# Multi-language support (Danish) — Design

Date: 2026-11-11
Status: Reviewed, awaiting user approval

## Goal

gc2-web is used primarily by Danes, but every UI text is hard-coded in English. Make the
app multilingual and ship Danish as the first translation. The language follows the
browser's language setting. Adding a third language later should only require one new
text file.

## Decisions (settled with the user)

1. **Browser decides the language.** Danish browser → Danish UI; anything else → English.
   There is no language switcher in the app.
2. **The side menu is not translated.** `SideMenu.tsx` keeps its English labels, including
   the group headings (Overview, Schema, Data, …).
3. **Technical terms stay English** in Danish text. The rule: a word stays English when
   it names a thing in the menu or in the database/API; ordinary words that are not a
   technical object are Danish.
   - **English:** Schema, Table, Column, Index, Constraint, View, Primary key, Sequence,
     Layer, Class, Style, Label, Tile, Tile Cache, Tile Seeder, Job, Snapshot, Rule,
     Key/Value, JSON-RPC, Function, OAuth Client, Scheduler, Realtime, Metadata, GraphQL,
     SQL, and the ~80 MapServer property labels in `src/features/map/fieldDefs.tsx`
     ("Outline color", "Min scale denom"), which mirror MapServer keywords and are left
     untouched.
   - **Danish:** bruger, brugernavn, gruppe, rettighed, række, navn, beskrivelse,
     kommentar, datatype and other everyday words.
   - Terms are used as loan words inside Danish sentences: "Tilføj column",
     "Opret index", "Slet constraint?", "Søg brugere",
     "Tile cache slettet: 1.234 tiles fjernet".
   - For a word not listed, apply the rule; when in doubt, keep the English term.
4. **Page titles that match a menu item stay English** ("Schemas", "Tile Seeder"), so the
   menu and the page it opens carry the same name.
5. **Everything around the terms is translated:** buttons, form labels, placeholders,
   help texts, tooltips, table column headers, confirmations, success/error/warning
   messages produced by the app, empty states, the login and callback pages, the offline
   banner.
6. **Server error messages are shown as received** (English). Only the app's own wrapper
   text around them is translated ("Kunne ikke gemme: <server message>").
7. **Fixed values from the server are shown as received:** job/run status
   (`running`, `failed`), privilege levels (`none` / `read` / `write`), relation type
   tags (TABLE, VIEW, MAT. VIEW) and enum option lists (`round/butt/square`). They are
   the same words users meet in the API and documentation. No value-to-label mapping.
8. **The AI assistant panel follows the same language.** `AgentChat` from
   `@mapcentia/gc2-agent-ui` already accepts `locale?: "da" | "en"`;
   `src/agent/AgentDrawer.tsx` hard-codes `locale="en"` today. Pass the detected
   language instead. Texts gc2-web renders around it (drawer title, open button tooltip)
   are translated like the rest. (Corrected after review: an earlier draft assumed the
   panel could not be translated.)

## Non-goals

- No language switcher, no per-user language setting stored on the server.
- No translation of the side menu, of technical terms, or of server-originated messages.
- No changes to the `@mapcentia/gc2-agent-ui` or `@mapcentia/gc2-sdk` packages themselves.
- No translation of user data (schema names, table names, metadata values).
- No right-to-left or pluralisation-heavy languages need to be considered now.

## Anti-goals

- A half-translated screen. A page that mixes Danish and English sentences (beyond the
  agreed English terms) is worse than an untranslated page.
- Danish inventions for established terms ("skema", "indeks", "begrænsning").
- English users noticing any change: with a non-Danish browser the app must read
  exactly as it does today.

## How (builder's calls unless marked as decided)

These are the author's choices, not the user's; a builder may deviate with good reason.

- **Library:** `react-i18next` + `i18next` + `i18next-browser-languagedetector`.
- **Detection:** from `navigator.languages` only. Do not cache the detected language in
  localStorage/cookies, so a changed browser setting takes effect on the next load.
  Walk the list in order and take the first entry that is Danish (`da`, `da-DK`) or
  English (`en*`); if neither occurs, use `en`. So `['en-US','da']` → English and
  `['de','da','en']` → Danish. This is the standard meaning of the browser's language
  preference order (author's call).
- **Server-provided form labels:** the metadata form (`MetaPropertiesForm` →
  `SchemaForm`) takes field titles, group headings and option names from the server's
  metaConfig. They are shown as received, like server error messages, and are an accepted
  exception in the verification walk. The app's own wrapper text is translated
  ("Vælg {{title}}", "Tilføj {{title}}") (author's call).
- **Text files:** `src/i18n/locales/en.json` and `src/i18n/locales/da.json`, one
  namespace, keys grouped per feature (`common.*`, `tables.*`, `map.*`, …). English is
  the fallback language and the source of truth for keys. Both files are bundled (no lazy
  loading; they are small).
- **Shared wording** (Save, Cancel, Delete, Create, Edit, Name, Actions, "Are you sure?")
  lives in `common.*` and is reused, so the same action is worded the same everywhere.
- **Interpolation and plurals** use i18next features (`{{count}}`, `_one`/`_other`)
  instead of string concatenation, e.g. "Edit Metadata (N)" and the tile-count messages.
- **Ant Design:** pass `locale` (`antd/locale/da_DK` or `en_US`) to the existing
  `ConfigProvider` in `src/App.tsx`, chosen from the same detected language. This covers
  date pickers, pagination, Popconfirm/Modal default buttons and empty states.
- **Texts outside React components** (stores, `fieldDefs.tsx`, column definitions built at
  module level, `utils/message` callers) use the i18next instance directly (`i18n.t`) or
  are moved to be evaluated at render time. Because the language never changes after
  load, module-level evaluation is acceptable provided i18n is initialised before those
  modules run (initialise in `src/main.tsx` before importing `App`).
- **Numbers and dates:** keep `toLocaleString()`; replace the hard-coded `'da-DK'` in
  `realtimeStore.ts` with the active language. Format with the active UI language so a
  Danish UI gets Danish number formatting.
- **`<html lang>`** in `index.html` is set to the active language at startup.
- **TypeScript:** type the `t` keys from `en.json` so a missing or misspelled key fails
  the build.

## Scope of the text extraction

Roughly 80 `.tsx` files / ~10,000 lines under `src/`: `auth/`, `components/`, `layout/`
(except `SideMenu.tsx` labels), `agent/` (own texts only) and every folder under
`features/`. `src/spike/` is throwaway code and is left untouched.

Work feature by feature so each step leaves fully translated pages (see anti-goals).

## Danish style

- Informal, concise, imperative on buttons: "Gem", "Annuller", "Slet", "Opret", "Rediger".
- Address the user as "du".
- English terms are not inflected with Danish plural endings where it reads awkwardly;
  prefer rephrasing ("3 tables valgt", "Ingen indexes fundet") and keep the term's
  English spelling. Use the correct English spelling (`Constraint`, not `Constrain`).
- Sentence case, as in the English source.

## Verification

- `npm run build` (type check + build) passes.
- With the browser language set to Danish, walk every route: no English sentences remain
  apart from the menu, agreed terms, server messages, fixed server values (decision 7)
  and server-provided metadata labels.
- With the browser language set to English (or any other), every page reads as before.
- A check (script or test) that `da.json` and `en.json` have identical key sets.

## Left to the builder

- Exact key names and file split inside `src/i18n/`.
- The Danish wording itself, within the style rules above.
- Whether to add a small lint/grep check for leftover hard-coded JSX text.
