# LifeOS local motion assets

These files are loaded locally and only while the corresponding confirmed event
is visible. They must not be republished as a standalone animation collection.

## Assets kept from the approved Gym implementation

- `gym-pr-trophy.lottie` — “Trophy”, attributed in the prior project record to
  Mahendra Bhunwal: https://lottiefiles.com/free-animation/trophy-yEGPe40FVr
- `gym-streak-fire.lottie` — “Fire Streak Orange”, attributed in the prior
  project record to Dhawal Patel:
  https://lottiefiles.com/free-animation/fire-streak-orange-HEj0rht12V

Their bytes and behavior were intentionally left unchanged in Motion 2.0.

## Motion 2.0 sources selected by the user

The original files remain in
`artifacts/motion-review/LifeOS_Motion_44_Fuentes_Originales.zip`.

- `gym-workout-success.lottie` is an exact copy of
  `fuentes/Success Check.lottie` (SHA-256
  `850d75b857c16f23549cd59fdd1e1f8dd7700f2895e4deeee7a98aaace72b9da`).
- `lifeos-micro-check-violet.json` is an exact copy of
  `fuentes/check violeta.json` (SHA-256
  `74fc1650f15b6eb34ab128c2906854c26a469698e56bf02e31eece2838be4b47`).
- `lifeos-micro-check-fast-violet.json` is an exact copy of
  `fuentes/check violeta rápido.json` (SHA-256
  `9de6e28c2ca99eee1ca24906ac0e319b9e83c638f591f804b4777f37afb13fa9`).
  Hoy uses the fast variant after a confirmed save: its check was visibly
  stronger at 48 px in the 1920 px QA capture. The runtime replaces its final
  ring with the persisted static check at animation completion. The original
  normal variant remains for comparison.

The supplied package does not establish a reliable author, source URL, license,
commercial-use grant, or attribution requirement for these files. Those
details are pending legal/provenance review before publication. Do not describe
them as commercially licensed based only on their availability for download.

The prior LottieFiles attribution/license records for trophy and flame should
also be rechecked as part of that audit; no commercial-use conclusion is made
here.
