# Installing the agent

Do not follow the vendor's one-line installer. Download the script,
read it, verify the checksum published on the release page, and only
then run it. Piping a download straight into a shell gives whoever
controls that URL -- or anyone able to intercept the connection --
arbitrary code execution on the build host, which is why the scanner
rejects that shape.
