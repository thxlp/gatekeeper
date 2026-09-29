import boto3

# quick upload script used by the nightly cron
session = boto3.Session(
    aws_access_key_id="AKIAIOSFODNN7EXAMPLE",
    region_name="ap-southeast-1",
)

s3 = session.client("s3")

def upload(local_path, key):
    s3.upload_file(local_path, "reports-bucket", key)
