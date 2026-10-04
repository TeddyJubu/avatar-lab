---
'@bible-strong/avatar-core': minor
'@bible-strong/avatar-react': minor
'@bible-strong/avatar-web': minor
---

Add optional face features. A definition can carry `face.mouth`, a stroked line that curves, turns
into a cat "ω", opens and tilts, and `face.whiskers`, tapered whiskers rooted on the cheeks. Each
expression can override their animatable values with `mouth` and `whiskers`, and transitions
interpolate them. `renderAvatar` returns `mouthPaths`, `whiskerBackPaths` and `whiskerFrontPaths`,
and the React and DOM renderers draw them. Definitions without a face render exactly as before.
