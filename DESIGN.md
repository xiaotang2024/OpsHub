---
name: OpsHub Control Plane
colors:
  surface: '#f9f9ff'
  surface-dim: '#d2daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e8eeff'
  surface-container-high: '#e0e8fd'
  surface-container-highest: '#dbe2f7'
  on-surface: '#141c2b'
  on-surface-variant: '#3d494c'
  inverse-surface: '#293040'
  inverse-on-surface: '#ecf0ff'
  outline: '#6d797d'
  outline-variant: '#bcc9cd'
  surface-tint: '#00687a'
  primary: '#00687a'
  on-primary: '#ffffff'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#4cd7f6'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#855300'
  on-tertiary: '#ffffff'
  tertiary-container: '#e79400'
  on-tertiary-container: '#563400'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f9f9ff'
  on-background: '#141c2b'
  surface-variant: '#dbe2f7'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  stat-metric:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  body-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  code-stream:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  badge-tag:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an uncompromising, mission-critical operations cockpit engineered specifically for DevOps architects, Site Reliability Engineers (SREs), and cloud infrastructure operators. It rejects superficial decoration in favor of high-signal situational awareness, maximum information density, and instant visual state diagnostics under intense operational rotations.

The aesthetic fuses **Tactical Modernism** with **Telemetry Terminal Realism**:
- **Tactical Precision:** Grounded in a pristine light-mode canvas (`#F8FAFC`) that minimizes eye strain during bright ambient light operations. High-contrast hairline grid lines (`#E2E8F0`) structurally partition telemetry streams, service fleets, and execution logs without clutter.
- **Phosphor Telemetry Feedback:** Crisp, luminescent phosphor accents direct cognitive attention. Electric Cyan (`#06B6D4`) leads active execution flows, supported by strict diagnostic signifiers: Emerald (`#10B981`) for healthy heartbeats, Amber (`#F59E0B`) for transitional pipeline locks and threshold warnings, and Crimson (`#EF4444`) for critical anomalies.
- **Glassmorphic Command Surfaces:** Heavy backdrop blurs (`12px` to `16px`) combined with semi-translucent light slate panels (`#FFFFFF` with fine specular borders) convey depth and stack order without distracting from real-time dynamic updates.
- **Dual Engine Typography:** Clean geometric grotesque typography guides human comprehension for high-level topologies, while rigorous monospaced data grids lock terminal streams, tabular metrics, network ports, and hash IDs into immutable vertical alignments.

## Colors

The color architecture is built exclusively for a light-mode first experience, maintaining razor-sharp contrast ratios across varied ambient light conditions.

### Architectural Canvas & Surfaces
- **Light Canvas (`#F8FAFC`):** The foundational substrate representing zero-state depth, providing infinite visual contrast for status indicators.
- **Surface & Cards (`#FFFFFF`):** The default container surface for panels, sidebar navigation, headers, and service fleet cards.
- **Elevated Hover Surface (`#F1F5F9`):** Micro-interaction lift state for hovered cards, active navigation rows, and interactive surfaces.
- **Terminal Void (`#0F172A`):** Recessed, ultra-dark viewport reserved strictly for stream logs, interactive shells, and unified diff comparisons.
- **Hairline Border (`#E2E8F0`):** 1px structural framing preventing visual bleeding between dense cards.
- **Active Structural Border (`#CBD5E1`):** Focus, active selection, and hover state border.

### Telemetry Status Roles
- **Primary Cyber Cyan (`#06B6D4`):** Denotes primary user agency, active navigation links, focused form inputs, and system gauges. Supported by `rgba(6, 182, 212, 0.15)` for tag backdrops and `rgba(6, 182, 212, 0.35)` for phosphor glows.
- **Telemetry Emerald (`#10B981`):** Represents operational health (`RUNNING`, normal probe status, CPU load < 60%). Backed by deep emerald fills (`rgba(16, 185, 129, 0.15)`).
- **Telemetry Amber (`#F59E0B`):** Represents intermediate execution or elevated pressure (`STARTING`, `STOPPING`, CPU load 60%–85%). Backed by amber fills (`rgba(245, 158, 11, 0.15)`).
- **Telemetry Crimson (`#EF4444`):** Critical alerts, panic states, and probe timeouts (`FAILED`, CPU load > 85%). Backed by crimson fills (`rgba(239, 68, 68, 0.15)`).

### Typography Tones
- **Slate Dark (`#0F172A`):** Primary headings, critical telemetry readings, and active entity labels.
- **Cool Secondary Slate (`#475569`):** Body paragraphs, field values, and secondary metadata.
- **Muted Technical Slate (`#64748B`):** Uppercase category headers, metric units, timestamps, and placeholder copy.

## Typography

The design system enforces a strict functional split:
- **Inter** handles narrative clarity, structured layout anchors, dashboard titles, body instructions, and interactive button text. Tight tracking on headings creates an authoritative, solid appearance.
- **JetBrains Mono** is mandatory for all machine outputs, network identifiers, memory addresses, real-time counters, column headers, and terminal outputs.

### Typographic Implementation Rules
1. **Tabular Numerals:** All numeric metric counters, time trackers, and process IDs must declare `font-variant-numeric: tabular-nums` to eliminate jitter during polling intervals.
2. **Metadata Tracking:** All uppercase technical headers (`label-caps`) enforce expanded tracking (`0.06em`) for rapid horizontal parsing on surfaces.
3. **Hierarchy Pairing:** Always render metric units (`MB`, `ms`, `%`, `req/s`) adjacent to numeric values using `label-caps` in muted slate (`#64748B`).

## Layout & Spacing

The layout model is anchored by a persistent viewport shell (`100vw x 100vh`) with locked boundaries to support high-frequency console operations.

### Structural Framework
- **Shell Structure:**
  - Fixed sidebar navigation (`256px` / `16rem`) locked to the left on desktop; converts to an off-canvas drawer with `backdrop-blur-md` overlay on mobile (<768px).
  - Global application header (`64px` / `4rem`) fixed to the top containing search, cluster selectors, clock ticker, and system breadcrumbs.
  - Primary viewport content pane with auto-scrolling (`overflow-y: auto`) and custom 6px track-inset scrollbars (`#F8FAFC` track, `#E2E8F0` thumb).
- **Grid Strategy:**
  - **Mobile (<640px):** Single-column stacked layout with compact component margins (`1rem`).
  - **Tablet (640px – 1024px):** 2-column service card layout; metric overviews arranged in 2x2 blocks.
  - **Desktop (1024px – 1440px):** 3-column service grid; 4-column overview metrics banner; `1.5rem` gutters.
  - **Wide Desktop (>1440px):** 4-column service grid or split 8/4 column layout for monitoring paired with live terminal inspection drawers.
- **Spacing Rhythm:** Based on a 4px module. Card interiors standardize to `1rem` (compact) or `1.25rem` (standard), balancing dense data with visual breathing room.

## Elevation & Depth

This system uses crisp surface layering, hairline edge definitions, and clean drop shadows tailored for light mode.

### Depth Layers
1. **Level 0 (Canvas Void):** Solid background (`#F8FAFC`). Lowest plane for full-screen dashboards.
2. **Level 1 (Recessed Void):** Sunken terminal consoles and code diffs (`#0F172A`), recessed into cards using a 1px border (`#334155`) and internal inset padding.
3. **Level 2 (Standard Surface):** Default card panels, table rows, and toolbars (`#FFFFFF`). Outlined with a continuous 1px hairline border (`#E2E8F0`).
4. **Level 3 (Interactive Lift):** Hovered cards and selected table rows (`#F1F5F9`). The border shifts to `#CBD5E1` with a subtle elevation shadow: `box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.05)`.
5. **Level 4 (Floating Modals & Flyouts):** Slide-over inspector panels, popovers, and alerts (`#FFFFFF` with `backdrop-filter: blur(12px)` and 95% opacity), bound by an active border (`#CBD5E1`) and ambient shadow `0 20px 25px -5px rgba(0, 0, 0, 0.10)`.

### Phosphor Glow Accents
Interactive and diagnostic focal points use targeted colored glows:
- **Cyan Signal:** `box-shadow: 0 0 15px -3px rgba(6, 182, 212, 0.35)`
- **Emerald Pulse:** `box-shadow: 0 0 12px -2px rgba(16, 185, 129, 0.25)`
- **Crimson Alarm:** `box-shadow: 0 0 14px -2px rgba(239, 68, 68, 0.30)`

## Shapes

The geometric framework balances technical rigor with modern UI ergonomics using `roundedness: 2` (`0.5rem` default radius).

- **Default Radius (`0.5rem` / `8px`):** Used for service cards, input controls, modal windows, code editor frames, and action buttons.
- **Large Radius (`1rem` / `16px`):** Applied to top-level modular dashboard widgets, fleet cards, and floating inspector sheets.
- **Small Radius (`0.25rem` / `4px`):** Used for embedded metadata panels, sub-spec tokens (e.g., port and PID indicators), and internal action trigger icons.
- **Full Pill (`9999px`):** Reserved exclusively for dynamic status chips, operational beacon badges, and cluster environment pills.

## Components

### Buttons
- **Primary CTA:** High-contrast solid Cyber Cyan background (`#06B6D4`), dark slate text (`#FFFFFF`), `font-weight: 700`, `rounded-lg` (`8px`), padded `px-4 py-2`. Accompanied by a cyan glow shadow. On hover: shifts to `#0891b2` with active click scaling (`scale-[0.98]`).
- **Secondary / Surface Action:** Light slate container (`#FFFFFF`), border hairline (`#E2E8F0`), text (`#475569`). On hover: text turns `#0F172A` and border brightens to `#CBD5E1`.
- **Destructive Action:** Subtle transparent red surface (`rgba(239, 68, 68, 0.10)`), red border (`rgba(239, 68, 68, 0.25)`), text red (`#EF4444`). On hover: background deepens to `rgba(239, 68, 68, 0.20)`.
- **Icon / Lifecycle Micro-Buttons:** Square button (`32px x 32px` or `28px x 28px`), `rounded-md`, border `#E2E8F0`, background `#FFFFFF`. Displays monochrome action icons (Play, Terminate, Restart, Terminal) that shift to cyan or amber on hover.

### Status Badges & Beacons
- **Format:** Monospace pill (`rounded-full px-2.5 py-1 text-[11px] font-medium font-mono inline-flex items-center gap-2`).
- **Operational (`RUNNING`):** `bg-[#10B981]/15 text-[#047857] border border-[#10B981]/30`. Features a dual-layer pulsating dot: a 6px center green circle wrapped in an animated pinging ring (`animate-ping`).
- **Transitional (`PENDING` / `STARTING`):** `bg-[#F59E0B]/15 text-[#B45309] border border-[#F59E0B]/30`. Contains an embedded spinning SVG indicator (`animate-spin`).
- **Critical Failure (`FAILED`):** `bg-[#EF4444]/15 text-[#B91C1C] border border-[#EF4444]/30` with a solid crimson beacon dot.
- **Offline / Halted (`STOPPED`):** `bg-[#64748B]/15 text-[#475569] border border-[#CBD5E1]` with a neutral gray dot.

### Cards & Fleet Modules
- **Container Structure:** Surface `#FFFFFF`, border `1px solid #E2E8F0`, `rounded-xl`, with internal padding `p-4` or `p-5`.
- **Embedded Spec Matrix:** Inner light inset box (`bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2.5`) splitting runtime attributes into key-value pairs (Port `:8080`, PID `#2049`, Path `/opt/runtime`) styled in `JetBrains Mono` 12px.
- **Card Footer:** Full-bleed segmented bottom action strip (`border-t border-[#E2E8F0] bg-[#F8FAFC]/60 px-4 py-2.5 flex items-center justify-between`).

### Input Fields & Controls
- **Text & Search Inputs:** Background `#FFFFFF`, border `1px solid #E2E8F0`, text `#0F172A`, placeholder `#94A3B8`, `rounded-lg`, height `36px` or `40px`, padding `px-3 font-mono text-sm`.
- **Focus State:** Border shifts cleanly to `#06B6D4`, accompanied by a subtle cyan focus ring (`ring-1 ring-[#06B6D4]/40`).
- **Checkboxes & Radios:** Sized at `16px x 16px`, background `#FFFFFF`, border `#CBD5E1`, checked state filled with `#06B6D4` and white checkmark icon.

### Live Terminal & Diagnostic Viewport
- **Container:** Recessed `#0F172A` background, `rounded-xl`, border `#334155`, integrated with xterm.js styling.
- **Interactive Cursor:** Solid cyan phosphor block (`#06B6D4`) with live cursor pulse.
- **Toolbar:** Sticky utility header (`border-b border-[#334155] bg-[#1E293B] px-4 py-2 flex items-center justify-between`) housing auto-scroll lock toggles, log buffer counters, and clear/download actions.