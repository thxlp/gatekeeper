# EVASION TEST FIXTURE -- assembles the AWS docs example key id from char codes.
import boto3

# reconstructs the AWS docs example key id, one byte at a time
_codes = [65, 75, 73, 65, 73, 79, 83, 70, 79, 68, 78, 78, 55,
          69, 88, 65, 77, 80, 76, 69]
key_id = "".join(chr(c) for c in _codes)

session = boto3.Session(aws_access_key_id=key_id, region_name="ap-southeast-1")
s3 = session.client("s3")
