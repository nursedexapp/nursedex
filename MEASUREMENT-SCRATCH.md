# Measurement scratch, delete with this branch

This branch exists only to hold ONE unchanged tree while the CI job is re-run
several times, alternating a warm and a cold vitest cache (#811).

Comparing across different branches cannot answer the question: each branch
runs a different amount of work, and the guard mutation step re-proves a
different subset depending on what changed. Here the tree is constant, so the
only thing that varies between runs is the cache.

Nothing here is proposed for main.
