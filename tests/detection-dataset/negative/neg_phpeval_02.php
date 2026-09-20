<?php
// Attachment handling: decode, validate the magic bytes, store on disk.
function store_attachment(string $b64, string $path): void
{
    $bytes = base64_decode($b64, true);
    if ($bytes === false) {
        throw new InvalidArgumentException('not valid base64');
    }
    if (substr($bytes, 0, 4) !== "\x89PNG") {
        throw new InvalidArgumentException('only PNG uploads are accepted');
    }
    file_put_contents($path, $bytes);
}
