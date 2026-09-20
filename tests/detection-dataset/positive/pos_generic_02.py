import psycopg2

DB_HOST = "db.internal.example.com"
DB_USER = "app"
password = "EXAMPLEPASSWORD0000notreal"


def connect():
    return psycopg2.connect(
        host=DB_HOST, user=DB_USER, password=password, dbname="app"
    )
