import os
import sys
from pathlib import Path

# Añadir el directorio backend a sys.path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

from app import app

# Exportar app para el runtime Serverless WSGI de Vercel
app = app
