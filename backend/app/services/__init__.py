"""Transactional operations: load rows, run the pure domain engine, write the result.

Write operations run in `transaction(immediate=True)`, so a read-then-write check (a gem
balance, a saved day, the last parent) can't interleave with another device's write.
"""
