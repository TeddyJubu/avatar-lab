---
'@bible-strong/avatar-core': minor
'@bible-strong/avatar-react': minor
'@bible-strong/avatar-web': minor
---

Body nodes accept an optional `color`, for details such as pink inner ears or a nose. When a node
has one, scenes report the fill of every body path in `colors.backPaths` and `colors.frontPaths`
(other nodes keep the frame's body color, expression tints included), and the React and DOM
renderers paint them. Definitions without node colors render exactly as before.
