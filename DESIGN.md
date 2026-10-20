---
version: alpha
name: Art-Apple-admin-design
description: Apple 式克制层级与 Art 后台密度的组合。以清晰内容层级、纯净表面、发丝边框和单一主题色建立秩序；表格、筛选、配置和业务监控保持紧凑、高信息密度。所有颜色必须服从 Art / Element Plus 当前主题，禁止引入固定品牌蓝或近黑主色。

colors:
  primary: "var(--el-color-primary)"
  primary-focus: "var(--el-color-primary-dark-2)"
  primary-soft: "var(--el-color-primary-light-9)"
  ink: "var(--el-text-color-primary)"
  body: "var(--el-text-color-regular)"
  muted: "var(--el-text-color-secondary)"
  placeholder: "var(--el-text-color-placeholder)"
  canvas: "var(--default-box-color)"
  canvas-muted: "var(--el-fill-color-extra-light)"
  surface: "var(--el-bg-color)"
  surface-raised: "var(--el-fill-color-light)"
  hairline: "var(--el-border-color-lighter)"
  border: "var(--el-border-color)"
  success: "var(--el-color-success)"
  warning: "var(--el-color-warning)"
  danger: "var(--el-color-danger)"
  info: "var(--el-color-info)"
  on-primary: "#ffffff"

typography:
  page-title:
    fontFamily: "Inter Variable, Noto Sans SC Variable, system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.2px
  section-title:
    fontFamily: "Inter Variable, Noto Sans SC Variable, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.1px
  title-sm:
    fontFamily: "Inter Variable, Noto Sans SC Variable, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: 0
  body:
    fontFamily: "Inter Variable, Noto Sans SC Variable, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  label:
    fontFamily: "Inter Variable, Noto Sans SC Variable, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0
  caption:
    fontFamily: "Inter Variable, Noto Sans SC Variable, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 10px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  page: 0px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 8px 14px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 8px 14px
  button-text:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
    height: 36px
  setting-group:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: 12px 14px
  setting-row:
    backgroundColor: transparent
    borderColor: "{colors.hairline}"
    padding: 12px 0
  table:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    headerBackgroundColor: "{colors.canvas-muted}"
    rowHeight: 40px
  sticky-action-bar:
    backgroundColor: "var(--el-bg-color-overlay)"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: 10px 14px

---

# Art × Apple Admin Design System

> Source inspiration: [Apple DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md). This is an Art admin adaptation, not a reproduction of Apple's consumer marketing site.

## 1. Core Direction

Use Apple for restraint, not for marketing scale:

- White and near-white surfaces make the content primary.
- One theme-derived action color is enough. It signals action, selection, focus, and links.
- UI depth comes from surface changes and 1px hairlines, never decorative shadows.
- Titles use 600 weight with slightly tight tracking; normal text stays 400.
- The default feeling is calm, ordered, and precise—not “card-heavy SaaS”.

Art is a business system. It must remain faster and denser than Apple marketing pages. Do not copy Apple's 48–80px section gaps, oversized display type, photographic hero tiles, black global navigation, or pill-first controls into normal system pages.

## 2. Theme and Color Rules

1. Use the color tokens above or existing Art / Element Plus variables only.
2. Never hard-code Apple Action Blue `#0066cc`, Apple black, or another product's branded colors as global UI colors.
3. `primary` is the only non-semantic interaction color. Keep `success`, `warning`, `danger`, and `info` for real operational states.
4. Use `canvas-muted` to separate table headers, quiet toolbars, and selected-adjacent regions. Do not use gradients as decoration.
5. Dark mode must continue to work through variables. Do not introduce fixed light backgrounds in normal application surfaces.

## 3. Typography and Fonts

The shipped font stack is `Inter Variable` for Latin/numerals and `Noto Sans SC Variable` for Chinese. Keep it as the cross-platform baseline.

- SF Pro is an Apple system font, not a distributable project dependency. Do not add it to the bundle or make Windows depend on it.
- Use 600, not 700, for page and section titles.
- Body copy is 14px in operational pages. Use 12px only for hints, timestamps, counts, and table metadata.
- Apply slight negative tracking only to page titles and section titles. Do not tighten small labels or dense table values.
- Avoid medium-weight body copy. Use 400 for supporting text and 600 for emphasis.

## 4. Layout and Density

### Application shell

- Let the existing Art shell own the outer page boundary. Feature pages must not add a second 16–24px outer padding.
- Standard gaps: 10px between related modules, 12px inside a group, 16px between independent groups, 24px only for a clear major break.
- Use a 200px-ish sticky side navigation only when a long configuration page needs in-page anchors.
- For in-page navigation, render every group in one scroll container. Clicking the left item scrolls smoothly to its matching group; scrolling updates the active navigation state.

### Settings pages

- Use one continuous configuration page with named groups, not a route-like tab switcher.
- A group begins with a concise title and one-line description, then a hairline separator.
- Simple settings may use a responsive two-column grid. Complex or risk-bearing settings use a full-width group.
- Prefer a setting row for toggles: label and explanation on the left, control on the right. Do not use a separate oversized card for every switch.
- Keep persistent save actions visible in a quiet sticky action bar.

### Data-heavy pages

- Tables, search bars, filters, batch actions, pagination, and permission controls remain compact Art patterns.
- Table rows target 36–40px; table headers use a quiet fill and hairline dividers.
- Keep filters and result actions close to the table. Do not introduce Apple-scale whitespace into CRUD pages.
- Use cards only to establish a genuine data or task boundary. Avoid nested cards and card-within-card shadows.

## 5. Surface, Border, and Elevation

- Default surface: flat white / theme surface with no shadow.
- Use one 1px hairline for boundaries between groups, table rows, inputs, and quiet cards.
- Use radii intentionally: 6px inputs and buttons, 8px utility groups, 10px only for a distinct floating or sticky surface.
- Shadows are normally prohibited. A subtle shadow is acceptable only for floating dialogs, drawers, or sticky action bars when required for separation.
- Never use a shadow merely to make a normal card look more important.

## 6. Components

### Buttons

- Primary action: one per local action cluster whenever possible.
- Secondary actions: bordered or plain buttons; destructive actions retain semantic danger treatment.
- Link buttons are for local navigation and low-risk inline actions, not the sole control for critical state changes.
- Do not default to pill buttons. Existing Art button radius is the standard.

### Forms

- Inputs use 36px height and 6px radius unless the surrounding Art component already owns dimensions.
- Top-aligned labels use 13px / 500; hints use 12px / 400 and secondary text color.
- Keep a label, input, and hint visually close; use 12–14px vertical spacing between form items.
- For dependent controls, hide or disable based on the existing business rule—never change validation or persistence while restyling.

### Navigation

- Side navigation is quiet and text-led. Use one icon, one label, and optionally a compact count.
- Selected state uses `primary-soft` background and primary text/icon; it must not depend only on color for accessibility.
- Keep enough vertical rhythm for scanning. Do not compress a settings navigation into a dense table of links.

### Feedback and status

- Status is semantic, not decorative. Operational safety alerts must retain their Element Plus status colors.
- Empty, loading, and permission-denied states follow existing Art patterns and should not be replaced by marketing illustrations.

## 7. Responsive Behavior

- Desktop: two-column setting groups only where each field remains legible.
- Below 900px: stack setting groups and make side navigation non-sticky.
- Below 640px: all form fields stack; action bars wrap; preserve 36px minimum control height.
- Do not hide required actions behind hover-only interactions.

## 8. Do / Don't

### Do

- Prefer one calm surface with meaningful separators over many elevated cards.
- Use theme variables, compact spacing, 600-weight headings, and a single visual focus.
- Treat configuration pages as a document with anchors; treat tables as operational tools.
- Preserve existing permissions, requests, validation, loading, empty states, and responsive layout when making visual changes.

### Don't

- Do not import Apple product colors, SF Pro files, black navigation, or 80px marketing whitespace wholesale.
- Do not add gradients, decorative color bands, or shadows to ordinary system UI.
- Do not override `--el-color-primary` inside a feature page.
- Do not make every configuration field its own card or every button a pill.
- Do not let visual simplification reduce table density, safety status clarity, or action discoverability.

## 9. Agent Checklist

Before changing a screen, verify:

1. Does the page rely on the Art shell's outer margin? If yes, add no second page padding.
2. Is the page data-dense? If yes, use compact table and filter patterns.
3. Is this a settings/document page? If yes, use anchored groups and a quiet persistent save action.
4. Are all colors theme variables and all statuses semantic?
5. Did the change preserve behavior, permissions, validation, requests, loading, empty states, and responsive layout?
