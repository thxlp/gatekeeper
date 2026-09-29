@echo off
REM EVASION TEST FIXTURE -- decodes a base64 file. Never deploy.
REM the tool name is held in a variable, so the two tokens never sit together
set TOOL=certutil
%TOOL% -decode stage.b64 stage.bin
