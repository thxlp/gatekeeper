# DETECTION TEST FIXTURE -- inert payload.
import subprocess

PAYLOAD = "VwByAGkAdABlAC0ASABvAHMAdAAgACIAcAB5ACIA"

subprocess.run(f"powershell -enc {PAYLOAD}", shell=True, check=False)
