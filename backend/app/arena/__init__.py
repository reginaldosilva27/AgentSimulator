"""133-arena-ai-judge — the Arena's (only) backend footprint.

Kept in its own package on purpose: the Arena is otherwise a pure frontend model,
and confining its server-side code to one directory keeps it from creeping into
``agent/``. Nothing here participates in the trace protocol — no ``Stage``, no
``TraceEvent``, no database.
"""
