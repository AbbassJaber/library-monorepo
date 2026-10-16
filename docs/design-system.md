# Design system

A media app for a small library: dark first, the covers as the hero, the chrome quiet and
neutral with one blue accent. The tokens live in `apps/web/src/styles/tokens.css` (CSS custom
properties, exposed to Tailwind 4 through `@theme inline`), the primitives in
`apps/web/src/components/ui`, the motion in `apps/web/src/lib/motion.ts`.
`node apps/web/scripts/contrast.mjs` (part of `pnpm lint`) fails when any text/background pair
drops below WCAG AA, in both themes, on paper and on every cover stage.

Screenshots of every main view, dark and light, are in [`docs/screenshots`](screenshots).

## Principles

1. **Covers carry the color.** Generated covers are the only saturated thing on a page; the
   chrome is near-black (or white) with one blue accent.
2. **Library objects, not widgets.** The book page is an open book with a library card; a
   proposed change is a reading list slip that gets stamped; an answer about books is a shelf.
3. **Plain words.** Buttons say what happens, empty states say what to do, errors say what went
   wrong. Sentence case everywhere.
4. **Motion has six jobs and no others** (see Motion), and all of it yields to reduced motion.
5. **Keyboard first, 44 px targets, native elements.** Every control is a native element or
   wraps one; dialogs are native `<dialog>`.

## Color

| Token                              | Dark                              | Light                             | Use                                       |
| ---------------------------------- | --------------------------------- | --------------------------------- | ----------------------------------------- |
| `--bg`                             | `#0E0F12`                         | `#FFFFFF`                         | page                                      |
| `--nav`                            | `#0A0B0D`                         | `#F6F7F9`                         | sidebar                                   |
| `--surface` / `--surface-2`        | `#15161B` / `#1B1D24`             | `#F6F7F9` / `#EEF0F3`             | panels, raised panels, user chat bubbles  |
| `--input`                          | `#17181D`                         | `#FFFFFF`                         | text fields                               |
| `--line` / `--line-strong`         | `#262832` / `#33353F`             | `#E6E8EC` / `#DADDE3`             | structure only                            |
| `--text` / `--text-2` / `--text-3` | `#F2F2F4` / `#A6A8B3` / `#8A8D99` | `#16181D` / `#5E6370` / `#6B7080` | text, secondary, meta                     |
| `--accent` (`--accent-ink`)        | `#5B8CFF` (`#0B0D12`)             | `#3A63E6` (`#FFFFFF`)             | the one action color: primary pills, Call |
| `--link`                           | `#8FB0FF`                         | `#2F56D3`                         | links                                     |
| `--success`                        | `#3DDC97`                         | `#136B3F`                         | AI status dot, "Confirmed"                |
| `--danger` / `--danger-solid`      | `#FF8080` / `#D42A30`             | `#C4282E` / `#D42A30`             | errors; End call                          |
| `--warning`                        | `#FFB547`                         | `#995200`                         | the call's last minute                    |
| `--focus`                          | `#8FB0FF`                         | `#2F56D3`                         | the focus ring (3:1+ everywhere)          |

Three scopes redefine the tokens for a region, the same in both themes:

- **`.cover-stage`** — the Home hero and other cover heroes: the cover's curated dark "stage"
  color (navy `#142347`, plum `#2B1538`, petrol `#0F2A35`, indigo `#1E1640`, oxblood
  `#3A1410`) with light text. Never a tint of the cover (that made cream and olive).
- **`.paper`** — the open book's page, the library card and reading list slips: cool off-white
  `#F2F3F5` (card `#FAFBFC`), ink `#16181D`, secondary `#575C68`, never cream. Inside paper the
  accent is the ink, so a primary button is the dark pill; the stamp is `#2F56D3`.
- **`.call-dark`** — the call screen and pill: always the dark tokens, whatever the theme.

Dark is the default; the toggle (persisted) cycles dark → light → system.

## Type

- **Geist** for everything; **Geist Mono** only for data (ISBNs, shelf marks, years in tables,
  ratings, scores, timers, keyboard hints); **IBM Plex Sans Arabic** (500, 700) for Arabic
  script. All bundled, no font requests.
- Scale: display 64/1.0/−0.035em/800 (a book title in a hero), h1 40/1.05/−0.03em/700, h2
  26/1.2/−0.02em/700, body 15–16/1.5, small 14, meta 13. Section labels are sentence case,
  14/600, never uppercase.
- `dir="auto"` on every user-authored text (titles, authors, synopses, messages); Arabic titles
  set `dir="rtl"` on covers.

## Shape and depth

- Radii: covers 6 px, controls 10–14 px, panels and heroes 24 px, primary buttons are pills.
- Shadows: hero and open-book covers, popovers and dialogs. Cards have none; a book card is a
  cover and its caption.

## Covers

`BookCover` (DOM and CSS, `aria-hidden`; the surrounding link names the book):

- A flat color field, **one** bold shape in an accent color (circle, band, half, arch, dot,
  stripes), the title and author typeset top-left (inset 9% top, 10% sides).
- Title Geist 800, line-height 1.02, −0.02em, sized by container query (~12.5cqw), clamped to 4
  lines; a long word shrinks the title instead of breaking (`coverTitleSize`). Author 0.55em/500.
- Palette and shape come from two independent stable hashes of the title; the palette (18
  entries, each `[background, text, accent, stage]`) is the domain's
  (`packages/domain-config`). A real cover image is used when the catalog has one.
- A 1 px inset ring on every cover; archived covers are greyscale with a text badge; "on your
  list" is a small dark pill with the state's name.

## Components

| Component                                         | Notes                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                          | primary (accent pill), inverse (high-contrast pill, on stages), secondary (outline pill), quiet, danger; `loading` keeps the label and sets `aria-busy`                                     |
| `IconButton`                                      | icon-only controls always take a `label` (`aria-label` + `title`)                                                                                                                           |
| `Field` + inputs                                  | label, hint, error wired with `aria-describedby` / `aria-invalid`; native `<select>`                                                                                                        |
| `Dialog`                                          | native `<dialog>` + `showModal()`: focus trap, Esc, backdrop, focus return. Variants: `center`, `sheet` (navigation under 1024 px), `command` (⌘K; `onRequestClose` lets it play its close) |
| `Badge`                                           | neutral, strong, danger, accent                                                                                                                                                             |
| `Skeleton`, `EmptyState`, `ErrorState`, `Toaster` | every page has loading, empty and error states; toasts are polite (info/success) or assertive (errors)                                                                                      |
| `Shelf`                                           | h2 + one-line subtitle + "See all", a horizontally scrolling row with scroll snap; prev/next only when it overflows; cards 168 px (132 px on phones)                                        |
| `Stamp`                                           | a rubber stamp on paper: the state (or "Added") and the day, rotated −8°                                                                                                                    |
| `LibraryCard`                                     | inside the open book's front board: shelf mark (`FIC` + three letters of the family name), the book's facts, "On your list since", the stamp                                                |
| `ShelfAnswer`                                     | cited books in a chat answer as covers standing on a ledge (one book: a larger card)                                                                                                        |
| Reading list slip                                 | `PendingActionCard`: paper with a perforated top edge, "Title → State", Confirm/Cancel, stamped on Confirm, greyed on Cancel                                                                |
| `Orb`                                             | the librarian: flat concentric circles (no gradient); small orbs are a ring and a disk                                                                                                      |
| `BookTable` + `WhyItMatched`                      | the catalog's dense table; during a search by meaning a side panel lists what matched and the ranking signals in Geist Mono                                                                 |
| Command menu                                      | cmdk inside `Dialog` (`command`): books, pages, actions, "Ask the librarian: …"; footer hints in Geist Mono                                                                                 |

## The open book

The book page (`/books/:id`) is an open book centered on the page: on the left the inside of the
front cover on the book's stage color with the library card glued in, on the right a paper page
with a running head (genre, year), the title (h1), the author, the synopsis (~46ch), the shelf
control as a dark pill and "Ask the librarian", "Books like this" as small covers and a folio
"1", with thin page edges on the fore-edge. Under 680 px of page width it is one page with the
library card inside it.

## The chat drawer and the call

- **Drawer** (480 px; full screen under 640 px): orb + "Librarian" + a live state line ("At the
  desk", "Looking through the catalog…"); user turns are neutral bubbles; answers are a short
  lead sentence and a shelf; proposed changes are slips; starter chips come from the reader's
  own list. The composer is one pill: message box (grows with the text up to 40% of the window, then scrolls inside), dictation mic, round Send.
- **Call** (always dark): a full-screen dialog with the orb, a state line (Connecting…,
  Listening, Thinking, Speaking), captions (the reader's last line dim, the librarian's large),
  books mentioned as cover chips, Mute / Captions / End call, a timer and the time left (warning
  color in the last minute). Minimize turns it into a pill at the bottom of every page.
- **Mic = dictation, Phone = call.** The mic only ever types; the phone icon is the call.

## Motion

GSAP, loaded on demand (`lib/motion.ts`); every animation runs inside `gsap.matchMedia` and
durations and eases are named constants. Six moments, nothing else moves:

1. **Open the book** (~1.2 s): from a cover on the app's pages, the closed book flies to the
   page, the front board swings open on the spine (perspective 2200 px), the page content
   rises, the stamp lands. Any key or click fast-forwards; Close swings it shut and flies it
   back. Back and direct loads: no animation. Focus moves to the h1.
2. **Flip**: books moving between reading states on My shelf, and the catalog grid when filters
   or sort change (not paging). What leaves fades out where it was.
3. **SplitText** on the signed-out Home headline, once per session.
4. **The orb** follows the call audio: listening grows from the outside in with the mic level,
   speaking from the inside out with the librarian's voice, thinking breathes slowly. The chat
   header's orb breathes while the librarian thinks.
5. **⌘K** opens and closes with a 150 ms scale and fade.
6. **Stamps** land with a short thunk (scale 1.8 → 1, −18° → −8°, back-out, 0.32 s).

Under `prefers-reduced-motion: reduce`: the book opens with a 0.2 s fade, Flip and the headline
do not run, stamps are simply there, the orb is still (its text state still changes), the menu
opens at once, and CSS transitions collapse to nothing.

## Accessibility contract

- Skip link to `#main`; landmarks `banner`, `nav[aria-label=Main]`, `main`, `contentinfo`; one
  h1 per page (the book's title on its page).
- 44 px minimum on every control; one `:focus-visible` ring that is never removed.
- `forced-colors: active`: controls, covers, stamps, slips and pages get `CanvasText` borders.
- Live regions: result counts, the chat log (`role="log"`, polite), call captions, toasts.
- Decorative things are `aria-hidden` (covers, orbs, running heads, folios); everything
  interactive is named.
- axe reports zero violations on every page in both themes, including the drawer, the ⌘K menu,
  the table with its side panel, the call screen and the pill (e2e).

## Do / don't

- Do let covers be the only saturated color; keep the chrome neutral with the one accent.
- Do use Geist Mono for data only, never for prose or labels.
- Do keep paper cool (`#F2F3F5`), never cream.
- Don't add motion beyond the six moments.
- Don't use color alone for state; pills and badges carry text.
- **Banned** (the "AI look"): any serif font; Inter; Space Grotesk; cream, beige or paper-colored
  backgrounds; terracotta, sage, bottle green, mustard; uppercase letter-spaced eyebrow labels;
  "01 / 02" numbered sections; decorative hairline rules; decorative gradients; glassmorphism;
  emoji in the UI.
