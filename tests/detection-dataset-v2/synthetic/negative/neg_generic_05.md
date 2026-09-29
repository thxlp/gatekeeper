# Configuration reference

| Variable | Meaning |
|---|---|
| `API_KEY` | key issued by the billing provider |
| `DB_PASSWORD` | database password for the app user |
| `SESSION_SECRET` | random 32-byte value used to sign sessions |

Generate the session value with `openssl rand -hex 32` and store it in
the deployment environment file. Do not write it into a config file that
lives in the repository; a line such as `secret = "changeme_placeholder_value"`
committed by accident is exactly what the scanner is meant to catch.
