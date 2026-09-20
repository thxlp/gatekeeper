# DETECTION TEST FIXTURE.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y curl ca-certificates \
    && curl -fsSL https://get.example.com/agent.sh | bash \
    && rm -rf /var/lib/apt/lists/*

CMD ["/usr/local/bin/agent"]
