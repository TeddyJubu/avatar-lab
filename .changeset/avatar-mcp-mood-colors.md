---
'@teddyjubu/avatar-mcp': minor
---

Match mood tints to each avatar: specs and `create_avatar_set` `shared` accept
`moodColors: "match"`, which derives the angry and uneasy fur tints from the avatar's own colors
while keeping its eyes readable, the new `set_mood_colors` edit switches an avatar between matched
and library tints, matched tints follow `set_colors`, and `matchedMoodColors` is exported.
`set_neutral_eyes` now rebuilds untouched bundled expressions from the library, so closed and
squinting eyes still close after the neutral eyes grow. The bundled character templates pick up
the Studio's fixes for clipped bodies, overlapping eyes and Freddy's eye contrast.
