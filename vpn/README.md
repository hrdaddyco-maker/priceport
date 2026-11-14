# Tunnels: free, nothing rented

Priceport's hosted app needs **no tunnel servers**: prices come from store APIs that take a country
parameter (Steam `cc`, Apple `country`, Microsoft `market`, Google Play `gl`), official per-country
pages (Spotify), and free proxy tunnels from open-source lists for sites that only price by IP (Netflix).

To browse or buy as another country yourself, use one of these free options on your own device:

| Option | Cost | How |
|---|---|---|
| **VPN Gate** (University of Tsukuba) | free | Priceport's *Tunnels* tab lists live servers by country (from `vpngate.net/api/iphone`) and gives you `.ovpn` files. Open one in OpenVPN Connect. |
| **Proton VPN Free** | free | Official app; the free plan picks from a few countries. |
| **Tor Browser** with an exit country | free | Add `ExitNodes {tr} StrictNodes 1` to the `torrc` (for example `{tr}` for Türkiye). Many stores block Tor. |
| **Cloudflare WARP** via [wgcf](https://github.com/ViRb3/wgcf) | free | `wgcf register && wgcf generate` gives a WireGuard profile. WARP exits near you, so it can't pick a country. It gives you privacy, not a regional price. |

These can't run inside the hosted app: Tor, WARP and Proton need a daemon or network interface, which serverless hosting doesn't provide.

## Optional: your own WireGuard exit node

If you ever have a Linux box in another country (a friend's machine, a free-tier cloud VM), run:

```bash
sudo bash vpn/install.sh --peers 3
```

It installs WireGuard and turns on IP forwarding and NAT. It writes client configs to `/etc/wireguard/clients/` and prints QR codes for the WireGuard app. Also open UDP 51820 in the provider's firewall.
