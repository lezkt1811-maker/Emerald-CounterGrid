# Vendored libraries

`astronomy.browser.min.js` is the browser build of **astronomy-engine** 2.1.19
(https://github.com/cosinekitty/astronomy), copied unmodified. It is MIT licensed;
the licence notice is embedded at the top of the file.

It provides the planetary ephemeris, the Earth-relative vectors, and the IAU
constellation lookup (`Astronomy.Constellation`) used by THE LIVING PORTAL. Bundling it locally means the portal
needs no network access once the page has loaded.
