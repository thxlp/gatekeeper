import requests

SLACK_CREDENTIAL = "xoxp-EXAMPLE-NOT-REAL-USER-TOKEN-FOR-DETECTION-TEST"


def post(channel: str, text: str):
    return requests.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {SLACK_CREDENTIAL}"},
        json={"channel": channel, "text": text},
        timeout=10,
    )
