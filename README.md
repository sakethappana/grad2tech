# Grad2Tech — demo website

A static, responsive demo website for **Grad2Tech**, a startup offering live, trainer-led Full Stack Development training with daily assignments, weekly assessments and a conditional placement commitment.

Built with plain HTML, CSS and a small amount of vanilla JavaScript. There is no build step, backend or framework.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All page content, icon sprite and the three dialogs (application, guidance request, enquiry) |
| `styles.css` | Design tokens, layout, components, animation and responsive rules |
| `script.js` | Navigation, accordions, roadmap expansion, dialogs, form validation and scroll reveals |
| `assets/favicon.svg` | Site icon |

## Preview locally

Any static file server works. From this folder, run one of:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .
```

Then open <http://localhost:8000> (or the address `serve` prints).

You can also open `index.html` directly in a browser; everything except the web font works offline.

## Notes for reviewers

- **Demo only.** Forms validate input and show a confirmation, but nothing is sent, stored or saved — there are no network requests and no `localStorage` use.
- **Font.** Manrope loads from Google Fonts; without a connection the page falls back to the system sans-serif.
- **Illustrative content.** The curriculum, learning roadmap, dashboard and classroom visuals are clearly labelled as illustrative. No fees, durations, batch dates, placement statistics, employers, testimonials or contact details are invented.
- **Placement and refund policy.** Presented as a proposed policy; the page states that final written terms will be provided before enrolment.
- **Accessibility.** Semantic headings, a skip link, keyboard-operable accordions and dialogs (Escape closes, focus is trapped and returned), visible focus states and `prefers-reduced-motion` support. Content stays visible if JavaScript is disabled.
