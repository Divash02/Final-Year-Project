# CollegeOS — Design System Specification

## 1. Color Palette Tokens
| Token | Hex Value | Usage |
|---|---|---|
| Background Main | `#F8FAFC` | Primary application canvas |
| Background Secondary | `#FFFFFF` | Cards, panels and table surfaces |
| Sidebar Background | `#FFFFFF` | Main navigation rail — light, not a dark slab |
| Sidebar Soft | `#F6F7F5` | Sidebar header/footer bands and hover rows |
| Sidebar Border | `#E4E7E3` | Divider between the rail and the workspace |
| Sidebar Text Primary | `#1F2937` | Main nav labels and active headers |
| Sidebar Text Secondary | `#6B7280` | Inactive menu labels |
| Sidebar Active Accent | `#0F766E` | Active menu item pill background |
| Primary Action | `#0F766E` | Institutional teal: buttons, focus rings, links |
| Primary Action Hover | `#115E59` | Hover state for buttons and primary actions |
| Text Primary | `#0F172A` | Headings, titles, high-contrast data values |
| Text Secondary | `#334155` | Subtitles, descriptions, secondary table text |
| Text Muted | `#64748B` | Placeholders, timestamps, helper text |
| Border Default | `#E2E8F0` | Card dividers, table borders, input strokes |
| Status Success | `#15803D` | Verified attendance, cleared payments, approved cases |
| Status Warning | `#B45309` | Pending requests, partial payments, warning alerts |
| Status Error | `#B91C1C` | Attendance below 75%, overdue fees, rejected cases |

## 2. Typography Scale
- Primary Font: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Page Title: `text-xl font-bold tracking-tight text-gray-900`
- Section Subtitle: `text-xs text-gray-500`
- Card Header: `text-sm font-semibold text-gray-900`
- Body Text: `text-xs text-gray-700 leading-normal`
- Table Cell: `text-xs text-gray-800`
- Metadata & Labels: `text-[11px] font-medium text-gray-500`

## 3. UI Component Specifications
- **Button**: 8px corner radius (`rounded-md`), subtle focus ring, Font Awesome icon support.
- **Card**: Clean white surface, `border border-gray-200`, `rounded-lg`, subtle shadow (`shadow-xs`).
- **Empty State**: Icon badge, clear title, explanatory paragraph, primary action button.
- **Modal**: Centered overlay, subtle backdrop blur, accessible escape-key handler.
