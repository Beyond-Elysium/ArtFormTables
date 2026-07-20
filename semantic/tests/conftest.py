"""Make the semantic/ modules importable when pytest runs from any cwd."""

import os
import sys

SEMANTIC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SEMANTIC_DIR not in sys.path:
    sys.path.insert(0, SEMANTIC_DIR)
