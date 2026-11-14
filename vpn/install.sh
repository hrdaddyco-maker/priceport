#!/usr/bin/env bash
# Priceport optional exit node: one-command WireGuard server for Ubuntu 20.04+/Debian 11+.
#   sudo bash vpn/install.sh [--port 51820] [--peers 3]
# Run it on a VPS in each country you want to appear from. Prints client configs (+ QR codes) at the end.
set -euo pipefail

PORT=51820
PEERS=3
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --peers) PEERS="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Needs Ubuntu/Debian (apt-get)." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard iptables qrencode curl

WG_DIR=/etc/wireguard
umask 077
mkdir -p "$WG_DIR/clients"

IFACE=$(ip -4 route show default | awk '{print $5; exit}')
PUBLIC_IP=$(curl -4 -fsS https://api.ipify.org || ip -4 addr show "$IFACE" | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')
COUNTRY=$(curl -fsS https://www.cloudflare.com/cdn-cgi/trace | awk -F= '/^loc=/{print $2}' || echo "??")

if [[ ! -f "$WG_DIR/server.key" ]]; then
  wg genkey > "$WG_DIR/server.key"
  wg pubkey < "$WG_DIR/server.key" > "$WG_DIR/server.pub"
fi
SERVER_KEY=$(cat "$WG_DIR/server.key")
SERVER_PUB=$(cat "$WG_DIR/server.pub")

cat > "$WG_DIR/wg0.conf" <<CONF
[Interface]
Address = 10.66.66.1/24
ListenPort = ${PORT}
PrivateKey = ${SERVER_KEY}
PostUp = iptables -t nat -A POSTROUTING -s 10.66.66.0/24 -o ${IFACE} -j MASQUERADE; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s 10.66.66.0/24 -o ${IFACE} -j MASQUERADE; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT
CONF

for i in $(seq 1 "$PEERS"); do
  ip_last=$((i + 1))
  key="$WG_DIR/clients/peer${i}.key"
  [[ -f "$key" ]] || wg genkey > "$key"
  pub=$(wg pubkey < "$key")
  cat >> "$WG_DIR/wg0.conf" <<CONF

[Peer]
PublicKey = ${pub}
AllowedIPs = 10.66.66.${ip_last}/32
CONF
  cat > "$WG_DIR/clients/priceport-${COUNTRY}-peer${i}.conf" <<CONF
[Interface]
PrivateKey = $(cat "$key")
Address = 10.66.66.${ip_last}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUB}
Endpoint = ${PUBLIC_IP}:${PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
CONF
done

echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-priceport-wg.conf
sysctl --system >/dev/null

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow "${PORT}/udp"; fi

systemctl enable --now wg-quick@wg0
systemctl restart wg-quick@wg0

echo
echo "Priceport exit node is up in ${COUNTRY} (${PUBLIC_IP}:${PORT}/udp)."
echo "Open UDP ${PORT} in your cloud provider's firewall/security list too."
for f in "$WG_DIR"/clients/*.conf; do
  echo; echo "== $f"; qrencode -t ansiutf8 < "$f"
done
