# Store image source and reproduction

The composition uses the extension’s existing CSS, HTML, scripts and PNG icons. It does not replace the overlay or popup with a drawing of their UI. The neutral sample player loads `content.css` and the production content scripts; only its Chrome API, media timing and URL recognition are fixtures. The popup frames load the actual root `popup.html`, `popup.css` and `popup.js` with mock Chrome data.

`artwork.svg` is an original, locally generated geometric mountain/lake illustration authored for this kit. It contains only original SVG shapes and gradients, with no real creator, brand, logo, stock image or fetched asset. No external image generator was used: code-native artwork keeps creation and every output inside this directory. Existing shield icons are reused unchanged.

`popup-light.png` is a Playwright capture of the actual popup under a light system theme. It is captured first and embedded beside the dark popup, because one Playwright context’s theme override otherwise makes both iframes dark. It is a composition input, not a separate store upload.

From the repository root, with the existing workspace-local Playwright installation, bundled Chromium and installed Pillow:

```powershell
python store/compose/capture.py
```

The script starts a temporary HTTP server bound only to 127.0.0.1, captures the seven final PNGs in `store/images/`, checks pixels/opacity, exercises ten popup scenarios in both themes, and checks the policy at 360px and 1280px in both themes. It blocks and reports nonlocal requests, records page/console errors, writes `.test-env/artifacts/v150/store-visuals.json`, closes the browser and stops its server. These fixtures validate presentation, not live sponsor detection.

To inspect the interactive composition manually, serve the repository root with a local static server and open `/store/compose/index.html?view=shield`. Other views: `marks`, `choice`, `themes`, `states`, `tile`, `marquee`. Popup API mocking is installed by the capture script; direct browsing without that harness does not supply extension APIs.

All final screenshots have a headline and sample-data label. Production overlay/popup styles are unchanged. The badge beside the generic player is an explicitly illustrative toolbar count using the real icon and badge colors; it is not browser chrome.

Other verification commands, from the repository root:

```powershell
node --test
python store/tools/package_release.py
python store/tools/check_permissions.py
python store/tools/check_lifecycle.py
python -u store/tools/run_e2e.py
```

The lifecycle harness uses an intercepted synthetic watch page and labeled media-property fixtures in Chrome’s isolated extension world. It tests actual extension install, reload, duplicate injection and invalidation separately from the single live YouTube run. The live E2E loads the extracted release only after opening a real watch page; it does not mock SponsorBlock or YouTube playback. Its setup seeks belong to the harness. Re-running live tests may give different results as data and buffering change. Historical scripts and results remain in `.test-env`.
