# mecharashi-wiki-assets

Images and icons for [mecharashi-wiki](https://github.com/thailehuy/mecharashi-wiki), served from
`https://assets.mecharashi-wiki.cc/`. They live here, separately from the wiki's text and code,
so frequent translation updates don't re-deploy several hundred MB of rarely-changing images.

Paths mirror the wiki's original layout — the wiki prepends `ASSET_BASE` (in its `index.html`)
to them, e.g. `data/unlisted/pilot_images_half/<icon>.png`. Keep new files under the same
folders; the wiki's `build_pages.py` reads this repo's file listing to pick link-preview images,
so it expects to find a checkout at `../mecharashi-wiki-assets` when run locally.

Pushing to `main` deploys via `.github/workflows/deploy.yml`.
