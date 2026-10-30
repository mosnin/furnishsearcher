# User source selection contract. Do not remove or weaken the24 requested identities.
# This law models actual source selection through verify-motion-contract.py.
# Monthly requests, owner approval, role access, focus and reduced motion also remain
# mandatory; native tests and browser checks establish those JavaScript/UI properties.
import Base
import ./proof/motion/DATA.bend as Motion

law requested_motion_sources_exact:
  {Motion.selected_ids() == [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n, 13n, 14n, 15n, 16n, 17n, 18n, 19n, 20n, 21n, 22n, 23n] : List<Nat>}
