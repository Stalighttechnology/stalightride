## Project architecture decisions

- Keep executive pitch copy in `src/content/pitch.json` so the public pitch page and downloadable deck remain factually aligned.
- Generate the PDF and its public-route embedded bytes together with `scripts/generate-pitch.py`; one generation step prevents the downloadable copies from drifting.
