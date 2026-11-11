## Project architecture decisions

- Keep executive pitch copy in `frontend/src/content/pitch.json` so the public pitch page and downloadable deck remain factually aligned.
- Generate the PDF with `scripts/generate-pitch.py`; the pitch page links straight to `frontend/public/downloads/synchoo-enterprise-pitch.pdf`, so there is one copy to keep current.
