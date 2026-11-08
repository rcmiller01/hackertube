# Installed YouTube attribution correction

Exact implementation: `bafa37de8507042f73b1e8a33bce1b43f8c5b14b`, version 0.2.2. Final filming of merged 159fc0b exposed the broken source image. The ordinary image element cannot send the Hermes SDK authorization header; the backend image URL is protected. An unauthenticated lookup returned 401. The native host’s documented static-asset route confirms why script/image requests cannot carry that header. Instead of creating another served-file path, the fix embeds the exact official PNG in the page and removes one unused backend route and the duplicate binary. One frontend renderer covers every normal card.

The real Chromium regression was committed red in `2408830`, before the fix. The first red harness draft (`fab6c39`) targeted two identical shared renderings and failed strict matching; that harness mistake was corrected before the real failure was captured. The final red asserts the broken backend URL. Green decodes the embedded asset and verifies its original SHA-256, successful browser decode, and 100-pixel display height while the obsolete endpoint is simulated as 401.

| Check | Value | Threshold | Disposition |
| --- | --- | --- | --- |
| Python | 309 passed | 0 failed | PASS |
| Node/Chromium | 83 passed, 0 skipped | 0 failed | PASS |
| Native validate | ok, 0 warnings | ok | PASS |
| Installed files | 39/39 match | all | PASS |
| Actual Hermes image | 1255×1075 decoded; 100px display height | decoded, ≥100px | PASS |
| Actual image source | embedded data URI | no authenticated image request | PASS |

The [installed check](installed-check.json), [screenshot](installed-branding.jpg), [manifest](installed-manifest.json), red/green logs and full-suite logs are beside this receipt. The first native check still showed old content because navigating only the URL hash preserved the loaded page component; a full reload loaded the corrected bundle, whose served bytes also matched the installed source. No authentication setting was weakened. Policy version/data use are unchanged and existing agreement remains valid. No extra paid Search was used to diagnose or verify the image. Job-25 film remains historical defect evidence and is not the final fixed-build demo.
