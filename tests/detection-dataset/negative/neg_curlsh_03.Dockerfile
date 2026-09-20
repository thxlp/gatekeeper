FROM debian:bookworm-slim

# Pinned .deb, checksum verified before installation.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates \
    && curl -fsSL -o /tmp/agent.deb https://get.example.com/agent_1.4.2_amd64.deb \
    && echo "0000000000000000000000000000000000000000000000000000000000000000  /tmp/agent.deb" \
       | sha256sum --check --status \
    && dpkg -i /tmp/agent.deb \
    && rm -f /tmp/agent.deb /var/lib/apt/lists/* -r

CMD ["/usr/local/bin/agent"]
