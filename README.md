# BuilderLab

**A lean, accessibility-first visual page builder for WordPress.**

> **Early beta.** BuilderLab is under active development and is not ready for production sites. Expect missing features, rough edges and breaking changes between versions. Use it on a test site and keep backups.

## What it is

BuilderLab lets you build WordPress pages visually, with an editor that has elements and properties on the left, a live canvas in the middle and nested layers on the right. It is a plugin, so it works with the theme you already use.

## Main purpose

To make building web pages fast **and** accessible, by default:

- **Accessibility first.** The aim is output that meets WCAG 2.2 level AA without extra work. Controls default to safe values (real `<button>` and `<a>` elements, 44 px targets, visible focus, contrast-checked colors), and a built-in checker flags problems while you edit.
- **Lean output.** One element in the editor is one element on the page. One small generated stylesheet of design tokens; JavaScript only for tabs and the navigation menu (about 1.4 KB gzipped together), loaded only on pages that use them.
- **No lock-in.** Pages are stored as standard WordPress block markup in `post_content`, so content stays readable if the plugin is removed.

## Features

**Elements (19)** container, heading, text, button, image, list, divider, quote, table, alert, HTML, accordion, tabs, navigation, breadcrumbs, search, form, loop grid, template.

**Visual editor**
- Elements, properties (Content, Style, Layout, Advanced), live canvas and a nested layers panel with groups, expand and collapse
- Drag and drop, a context menu, undo and redo, copy and paste
- Per-device values (desktop, tablet, mobile) for width, visibility, flex layout, padding and margin
- Flex container controls: direction, justify content, align items, wrap, gaps; per element align self, order and size
- Gaps and sizes in px, rem, em, %, vw and vh
- Page layout per page: theme default, full width, or a bare canvas with no header and footer; the editor preview matches the live page
- "Edit with BuilderLab" in the page list, the admin bar and the edit screen, for the content types you choose, including custom post types
- Resizable side panels (up to 30% of the window), remembered between visits
- Text editing directly on the canvas (double-click), with per-device typography
- Custom CSS per element in the Advanced tab: write `this` to point at the element, for example `this:hover { color: red; }`
- Clicking an accessibility issue scrolls the preview to the element
- Dark and light editor theme

**Accessibility**
- Checker with an on/off switch; flags missing alt text, skipped heading levels, empty buttons and links, vague link text, missing table captions and headers, unlabeled fields and low contrast
- Informational summary when publishing (never blocks)
- Contrast ratios for colors, with suggestions

**Design system**
- Colors, typography, spacing, shape, focus ring and target size as design tokens
- Roles (what a color is for) and component styles (buttons, alerts, fields, tables, quotes)
- A live style guide, a contrast matrix (warns only), revisions, import and export, and WP-CLI commands (`wp builderlab ds`)

**Loop grid**
- Lists posts, pages or any public custom post type, with an optional term filter, order and items per page
- Columns per device, numbered or previous/next pagination, optional AJAX pagination (about 2 KB of script, loaded only when used; links still work without JavaScript)
- A card creator: choose built-in fields, ACF fields or custom fields, in the order you want

**Navigation**
- Write your own links, or use a menu made in WordPress (classic menus and block theme navigation)

**Templates**
- Header, footer and reusable component templates
- Display conditions with include and exclude rules; the most specific rule wins
- Dynamic images from the featured image, ACF image fields, any custom field or ACF options

**Forms**
- Labelled fields, server-side validation, error summary with focus management, entries stored in the dashboard

## Requirements

- WordPress 6.5 or newer (developed and tested on WordPress 7.1)
- PHP 7.4 or newer (tested on PHP 8.x)
- A block theme gives the best results; replacing the header and footer on classic themes is implemented but not yet verified

## Installation

1. Download this repository as a ZIP, or clone it into `wp-content/plugins/builderlab`.
2. Activate **BuilderLab** in the Plugins screen.
3. Open **BuilderLab, Settings** and choose the content types that get the **Edit with BuilderLab** button.
4. Open **BuilderLab, Design system** to set your colors, type and spacing.

There is no build step; the plugin runs as it is.

## Known limitations (early beta)

- No automated test suite yet; behavior was checked with scripted browser sessions
- Drag and drop was verified with generated drag events; please try it with a mouse
- Breakpoints are fixed (tablet up to 1024 px, mobile up to 767 px)
- Dynamic fields are available for images and in loop grid cards; text, links and backgrounds on a single page are not dynamic yet
- Menu item options such as "open in a new tab" are not used by the navigation element yet
- Automated checks find only part of the accessibility issues; keyboard, screen reader and zoom checks are still needed

## Third-party software

- [axe-core](https://github.com/dequelabs/axe-core) (Mozilla Public License 2.0) is bundled in `assets/vendor/` and used only inside the editor for the accessibility scan. Its license is in `assets/vendor/axe-core-LICENSE.txt`.

## License

GPL-2.0-or-later. See `LICENSE`.
