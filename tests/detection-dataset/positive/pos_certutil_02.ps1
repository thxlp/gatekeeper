# DETECTION TEST FIXTURE.
certutil -decode .\stage.txt .\stage.dll
rundll32.exe .\stage.dll,Start
