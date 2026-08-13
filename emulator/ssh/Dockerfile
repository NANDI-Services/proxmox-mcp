FROM alpine:3.20

# openssh-client is what makes a hop possible: the entry node needs to be able
# to ssh onward to a peer, exactly as a real Proxmox node can.
RUN apk add --no-cache openssh-server openssh-client bash curl

# Key-only root access. This container is a throwaway test fixture on an
# isolated compose network and is never published.
RUN sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

COPY pct /usr/local/bin/pct
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/pct /usr/local/bin/entrypoint.sh

EXPOSE 22

HEALTHCHECK --interval=2s --timeout=3s --retries=15 --start-period=2s \
  CMD nc -z 127.0.0.1 22 || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
