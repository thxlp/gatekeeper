<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

$payload = "ZWNobyAibG9hZGVkIjs=";

function boot($blob) {
    eval( base64_decode( $blob ) );
}

boot($payload);
