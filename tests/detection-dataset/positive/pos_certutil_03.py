# DETECTION TEST FIXTURE.
import subprocess

subprocess.run(["cmd", "/c", "certutil -decode blob.txt blob.exe"], check=False)
