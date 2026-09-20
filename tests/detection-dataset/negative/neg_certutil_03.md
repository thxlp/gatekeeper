# Living-off-the-land binaries we watch for

`certutil` ships with Windows and can fetch and decode files, so
attackers use it to stage a payload without dropping a downloader. The
scanner flags the decode switch specifically. Certificate store work
(`-addstore`, `-verify`) and hashing (`-hashfile`) are ordinary
administrative uses and are not flagged.
