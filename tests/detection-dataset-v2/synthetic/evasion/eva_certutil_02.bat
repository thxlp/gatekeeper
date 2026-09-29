@echo off
REM EVASION TEST FIXTURE -- decodes a base64 file. Never deploy.
cert^util -decode stage.b64 stage.bin
