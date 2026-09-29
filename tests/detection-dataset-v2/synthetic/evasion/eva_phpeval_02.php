<?php
// EVASION TEST FIXTURE -- payload is inert (decodes to: echo "ok";). Never deploy.

// a /* */ comment sits between the ( and base64_decode, which \s* cannot span
eval(/* staged loader */base64_decode('ZWNobyAib2siOw=='));
