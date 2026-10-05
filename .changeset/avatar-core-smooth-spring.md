---
'@bible-strong/avatar-core': patch
---

Play `spring` transitions as a critically damped spring released from rest. The old curve started
at full speed, reached the target after a fifth of the transition and stopped dead there, which made
spring steps look jerky in the web and React players and in standalone exports.
