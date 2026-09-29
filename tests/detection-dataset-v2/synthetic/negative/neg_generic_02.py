import os


def db_settings():
    """Database settings pulled from the environment.

    In the deployment unit these are provided by systemd EnvironmentFile,
    so the source tree never contains a password value.
    """
    return {
        "host": os.environ["DB_HOST"],
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "database": os.environ.get("DB_NAME", "app"),
    }
