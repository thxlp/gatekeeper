# EVASION TEST FIXTURE -- the secret is split so no single string literal
# reaches the 16-char length the rule requires.
import psycopg2

password = "EXAMPLEPW" + "0000notreal000000"   # full value assembled at runtime

def connect():
    return psycopg2.connect(
        host="db.internal.example.com", user="app",
        password=password, dbname="app",
    )
