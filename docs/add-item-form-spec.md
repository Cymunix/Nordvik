# NORDVIK — Add Item form field spec

This is the **literal source of truth** for what fields appear on each category's
Add Item form, in what grouping and order. Do not infer or reuse another
category's shape — each category has been reviewed individually and they are
**not all the same**. When building or auditing a category's form, read this file
first and diff against it explicitly before making changes.

## Standing rules (apply across all categories)

- **Cascading Taxonomy levels auto-select when a level has only one valid child.**
  No dropdown is shown for a choice that isn't actually a choice — this applies to
  every level (Category → Subcategory → Franchise → Subfranchise → Property →
  Item Type), not just specific ones.
- **Subject vs. Portrays:** *Subject* is what the item depicts (a fictional
  character, e.g. "Luke Skywalker"). *Portrays* is the real person a fictional
  depiction is based on (e.g. "Mark Hamill"). Portrays only applies when an item
  depicts a real person via a fictional character or a direct likeness. It's
  expected to be blank/empty on most items.
- **Publisher/Manufacturer is only included when it adds information beyond
  Subcategory.** Drop it when Subcategory already functions as the brand field
  (e.g. Building Blocks: Subcategory = LEGO/Mega Bloks — Publisher would repeat
  it). Keep it when Subcategory means something else (e.g. Toys: Subcategory =
  product type like "Figures", so Publisher = Funko is new information).
- **Franchise and Property meaning is allowed to vary by category.** Franchise
  means "the IP" in most categories, but can mean manufacturer (Sports Cards:
  Franchise = Panini) or platform (Video Games: Franchise = Playstation 1) when
  Subcategory already anchors the IP/brand. Don't force uniformity across
  categories where the underlying products don't work the same way.
- **Format legality (Trading Cards only) is never a single-value field.** Store
  only the formats a card IS legal in (absence = not legal by convention).

---

## Building Blocks — FINALIZED

**Cascading Taxonomy** (auto-select when a level has only one child)
- Category
- Subcategory
- Franchise
- Subfranchise
- Property
- Item Type

**Attached Facets**
- Collection
- Subject
- ID Number

**Item Metadata**
- Description
- Pieces
- Retail Price
- Release Year
- Availability
- Barcodes
- Includes
- Included In
- Portrays

**No Publisher/Manufacturer field** — Subcategory already covers brand (LEGO,
Mega Bloks, etc.); adding Publisher would be redundant.

---

## Trading Cards — FINALIZED

**Cascading Taxonomy** (auto-select when a level has only one child)
- Category
- Subcategory
- Franchise
- Subfranchise
- Property
- Item Type

**Attached Facets**
- Collection
- Subject
- ID Number
- Publisher

**Item Metadata**
- Description
- Pieces
- Retail Price
- Release Year
- Availability
- Barcodes
- Includes
- Included In
- Rarity

**Card Metadata**
- Unit Level
- Evolves From
- Evolves To
- Attack
- Health
- Damage
- Shields
- Type
- Abilities
- Weakness
- Resistance
- Artist
- Language
- Legal
- Cost
- Finish

### Legal field — special handling

Legal is a **multi-select of which formats the card is legal in** (e.g. Standard,
Modern, Commander, Legacy) — not free text, not a per-format Legal/Not Legal
toggle. A format's absence from the selected list means "not legal" by default;
only legal formats are stored.

**Storage:** `card_format_legality` table, one row per format the card is legal
in — no `status` column.

- `item_id` — FK to items
- `format` — text
- unique constraint on `(item_id, format)`

**`game` column decision — RESOLVED: omit it.** For Trading Cards the Subcategory
*is* the game (live values: Magic: The Gathering, Marvel, One Piece, Star Wars,
Teenage Mutant Ninja Turtles), so `items.subcategory_id` already identifies the
TCG unambiguously and a `game` column would be duplicated state that can drift.
**Hazard to respect:** format names collide across games (Pokémon "Standard" is
not MTG "Standard"), so every legality query must scope by game via the join to
`items.subcategory_id` — never filter on `format` alone.

**Data source:** Scryfall API for Magic legality where possible, rather than
manual entry. Other TCGs may need a different/manual source — flag if no public
API exists. (Known: Pokémon legality is available via TCGdex `legal.standard` /
`legal.expanded`, already mapped by the Pokémon importer. One Piece: no public
legality API found — manual.)

**Item detail view:** show Legal as a badge/pill list of just the formats the
card is legal in (compact grid, muted background for the pill) — do not show
"not legal" states.

---

## Toys — NOT YET FINALIZED

Known from review so far:
- Keeps Publisher/Manufacturer (Subcategory = product type like "Figures", not
  brand, so Publisher = Funko is new information).
- Includes Portrays (e.g. Luke Skywalker figure → Portrays: Mark Hamill).
- Subcategory example: "Figures." Franchise example: "Jurassic Park."

**Full field list and grouping TBD — do not build/audit this form against guessed
fields. Wait for explicit list.**

---

## Sports Cards — NOT YET FINALIZED

Known from review so far:
- Whether it needs a Publisher/Manufacturer field the way Trading Cards does is
  unconfirmed — original example had Franchise = Panini (manufacturer), with
  Subcategory = sport (e.g. American Football) anchoring the IP.
- Likely does NOT need the Card Metadata block (Evolves From/To, Attack, etc.)
  the way Trading Cards does — sports cards aren't game-mechanic cards. Confirm
  with the user before assuming this.

**Full field list and grouping TBD.**

---

## Movies — NOT YET FINALIZED

Known from review so far:
- Subcategory can be redundant with Franchise for single-brand franchises
  (Star Wars: Subcategory = Star Wars, Franchise = Star Wars) — this is
  intentional, not a bug. Don't force a Lucasfilm-style studio layer in to avoid
  the duplication.
- Has its own Movie Metadata block: Starring, Directors, Music by, Screenplay by,
  Story by, Produced by, Cinematography, Edited by, Production company, Country.

**Full field list and grouping TBD.**

---

## Video Games — NOT YET FINALIZED

Known from review so far:
- Franchise can mean platform/generation (e.g. "Playstation 1") when Subcategory
  already anchors the platform maker (e.g. "Sony") — intentional per the
  Franchise-flexibility rule above.
- **Two mutually exclusive metadata blocks, chosen by Item Type:**
  - *Console Metadata*: Generation, Predecessor, Successor, Backward compatibility
  - *Game Metadata*: Developer, Producer, Programmers, Artist, Writers, Composer,
    Engine, Genre, Modes
  Only one is shown per item, depending on the selected Item Type (Console vs Game).

**Full field list and grouping TBD.**

---

## Music — NOT YET FINALIZED

Known from review so far:
- Has its own Music Metadata block: Artists, Country, Genre, Style.
- Confirm whether Music needs Publisher/Manufacturer — likely yes (record label),
  analogous to Trading Cards, but not yet explicitly confirmed.

**Full field list and grouping TBD.**

---

## Change log

When a category's field list is finalized or amended, update this file **in the
same PR/commit as the form change**, so the doc never drifts out of sync with
what's actually built. Do not let the form and this doc diverge.

- 2026-08-01 — Building Blocks and Trading Cards finalized. Trading Cards Card
  Metadata gains Unit Level / Damage / Shields; Rarity sits in Item Metadata.
  `card_format_legality` added; `game` column resolved as omitted.
