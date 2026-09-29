@echo off
REM Legitimate certificate work: import a CA bundle into the machine store.
certutil.exe -addstore -f Root "%~dp0corporate-ca.cer"
