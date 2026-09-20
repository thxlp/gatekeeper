@echo off
REM DETECTION TEST FIXTURE -- classic AV-evasion staging pattern.
certutil.exe -decode payload.b64 payload.exe
start "" payload.exe
