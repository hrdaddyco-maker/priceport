// Shortcuts for popular subscriptions, region-lock guidance per store, and the VPN list.
// Guidance is general policy knowledge, not prices. Prices always come from live sources.
const SHORTCUTS = [
  { re: /spotify/i, store: 'spotify', id: 'premium', title: 'Spotify Premium', image: 'https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png', planHints: { family: 'family', duo: 'duo', student: 'student', individual: 'individual', single: 'individual', solo: 'individual' } },
  { re: /game ?pass ultimate|ultimate game ?pass|gpu\b/i, store: 'msstore', id: 'CFQ7TTC0KHS0', title: 'Xbox Game Pass Ultimate' },
  { re: /pc game ?pass/i, store: 'msstore', id: 'CFQ7TTC0KGQ8', title: 'PC Game Pass' },
  { re: /game ?pass essential|game ?pass core/i, store: 'msstore', id: 'CFQ7TTC0K5DJ', title: 'Xbox Game Pass Essential' },
  { re: /game ?pass|xbox pass/i, store: 'msstore', id: 'CFQ7TTC0KHS0', title: 'Xbox Game Pass Ultimate' },
  { re: /chat ?gpt|openai/i, store: 'apple', id: '6448311069', title: 'ChatGPT (App Store in-app prices)', planHints: { plus: 'chatgpt plus', go: 'chatgpt go', pro: 'chatgpt pro 200' } },
  { re: /\bgrok\b/i, store: 'apple', id: '6670324846', title: 'Grok (App Store in-app prices)' },
  { re: /duolingo/i, store: 'apple', id: '570060128', title: 'Duolingo (App Store in-app prices)' },
  { re: /tinder/i, store: 'apple', id: '547702041', title: 'Tinder (App Store in-app prices)' },
];

const NOT_LIVE = {
  netflix: "Netflix only shows prices to visitors from inside each country (by IP), and has no public per-country price feed, so we can't pull it without a real VPN exit. Check help.netflix.com/node/24926 from each region.",
  'youtube premium': "YouTube Premium prices are shown only to signed-in visitors by location, so we can't read them live. See youtube.com/premium.",
  'disney': "Disney+ sells mostly on its own site by location, with no public per-country price feed we can read.",
};

const RULES = {
  steam: {
    works: 'Sometimes',
    text: "Steam sets your store country from where you are and the payment method you use. To change it you must make a purchase with a payment method from the new country while you're there. Some games are region-locked or can't be gifted across regions, and Steam can block keys/gifts bought in cheaper regions. Turkey and Argentina now price in USD, so they're less of a bargain than they used to be.",
    pay: 'Local card or local Steam wallet code (gift card) for that country.'
  },
  apple: {
    works: 'Sometimes',
    text: "An Apple Account's country is tied to the billing address of its payment method. To switch, you must cancel active subscriptions, spend your balance, and add a payment method from the new country — or top up with a gift card bought for that country's App Store. Some apps and in-app plans aren't offered in every storefront.",
    pay: "Local card with a local billing address, or an App Store gift card for that country."
  },
  msstore: {
    works: 'Sometimes',
    text: "Microsoft lets you change your account region (Xbox allows it about once every 3 months), but payment methods must match the region. Xbox / Game Pass gift cards and codes only redeem in the region they were sold for. Microsoft can cancel subscriptions bought against its terms.",
    pay: 'Card from that country, or a region-matched Xbox gift card / Game Pass code.'
  },
  spotify: {
    works: 'Rarely',
    text: "Spotify ties Premium to your account country and checks where you actually are. Travelling with Premium is fine, but if you stay in another country you're asked to update your account country, and you pay with a method from that country. Family and Duo also expect members to live at the same address.",
    pay: 'Card from that country, or a Spotify gift card sold in that country.'
  }
};

// Ranked by: independent no-logs audits, open-source clients, transparent ownership, privacy-friendly payment, and broad server coverage.
// No affiliate links. Links go to each provider's own site.
const VPNS = [
  { name: 'Mullvad', url: 'https://mullvad.net', why: 'No email needed to sign up, flat €5/month, accepts cash and crypto, independently audited, open-source apps.' },
  { name: 'Proton VPN', url: 'https://protonvpn.com', why: 'Swiss-based, open-source apps, audited no-logs policy, has a free tier (limited locations).' },
  { name: 'IVPN', url: 'https://www.ivpn.net', why: 'Small privacy-first provider with audits, anonymous accounts and a transparent team.' },
  { name: 'NordVPN', url: 'https://nordvpn.com', why: 'Very large server network across many countries, audited no-logs claims — handy when you need an exit in a less common country.' },
  { name: 'Surfshark', url: 'https://surfshark.com', why: 'Unlimited devices on one plan and lots of country locations.' },
  { name: 'ExpressVPN', url: 'https://www.expressvpn.com', why: 'Wide country coverage and easy apps; pricier than most.' },
  { name: 'Windscribe', url: 'https://windscribe.com', why: 'Usable free plan with a handful of countries, build-a-plan pricing for just the locations you need.' },
];

module.exports = { SHORTCUTS, NOT_LIVE, RULES, VPNS };
