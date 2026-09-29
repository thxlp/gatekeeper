<?php
// Signed cookie decoding. Base64 in, HMAC verified, JSON out. No eval.
function read_session_cookie(string $cookie, string $key): ?array
{
    [$body, $sig] = array_pad(explode('.', $cookie, 2), 2, '');
    $decoded = base64_decode(strtr($body, '-_', '+/'), true);
    if ($decoded === false) {
        return null;
    }
    $expected = hash_hmac('sha256', $body, $key);
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    return json_decode($decoded, true);
}
