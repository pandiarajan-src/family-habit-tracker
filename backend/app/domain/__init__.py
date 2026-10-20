"""The domain engine: pure functions for streaks, gems, savers, balances and permissions.

No database, no FastAPI and no clock: callers pass plain dates and IDs in, so every rule can be
unit-tested with a table. Inputs never carry nicknames or titles [child-data-privacy #2].
"""
