"""The quiz library: one folder that keeps quizzes, their versions and results.

The library is a layer on top of fullmark. It imports core modules; the core never
imports this package (only `cli.py` does, lazily, inside its library handler).
"""
