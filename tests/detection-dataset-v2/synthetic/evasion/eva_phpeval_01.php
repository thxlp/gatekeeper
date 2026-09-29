<?php
// EVASION TEST FIXTURE -- payload is inert (decodes to: echo "ok";). Never deploy.

// the decoder is reached through a variable, so the sink pair never sits together
$fn = 'base64' . '_decode';
eval($fn('ZWNobyAib2siOw=='));
