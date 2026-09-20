@echo off
REM Runs the packaged installer with a normal script file.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
