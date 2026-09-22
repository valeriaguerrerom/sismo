"""Configuración de pytest: asegura que backend/ esté en sys.path.

Permite `import main`, `from core...`, `from api...` al ejecutar los tests
desde la carpeta backend/ o desde la raíz del proyecto.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
