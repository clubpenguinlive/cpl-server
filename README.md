# cpl-server

The Node game server for [Club Penguin Live](https://github.com/clubpenguinlive), a fan-made
recreation of the Club Penguin online game. This repo is the backend only: authentication, the
Socket.IO game protocol, room/player state, and the MySQL-backed economy (coins, items, igloos,
stamps, clubs). The web client that connects to it lives in a separate `cpl-client` repo.

This is a fork of [wizguin/yukon-server](https://github.com/wizguin/yukon-server), the Yukon
server framework, extended with Club Penguin Live's own gameplay systems.

## Tech stack

- Node.js, [Socket.IO](https://socket.io/) for the game protocol
- [Sequelize](https://sequelize.org/) over MySQL/MariaDB
- Babel (source in `src/`, built to `dist/` for production)
- Docker Compose for the production stack (see below)

## Running it

- **Local development:** MySQL/MariaDB + Node, run directly with `npm run dev`. See
  "Local Installation" below.
- **Self-hosting / production:** Docker Compose, using the images and compose file in this repo.
  See **[DEPLOY.md](DEPLOY.md)** for a full walkthrough: prerequisites, configuring `.env`
  secrets, building the image, and exposing the game worlds. Reverse proxy and TLS setup are the
  operator's own responsibility; `DEPLOY.md` covers what the server itself expects.

## Local Installation

### Prerequisites

- [Node.js](https://nodejs.org/en/)
- A MySQL or MariaDB database
- A compatible client, e.g. [cpl-client](https://github.com/clubpenguinlive/cpl-client) or
  [wizguin/yukon](https://github.com/wizguin/yukon)

### Setup

1. Clone this repo and install dependencies.

```console
git clone https://github.com/clubpenguinlive/cpl-server.git
cd cpl-server
npm install
```

2. Copy `config/config_example.json` to `config/config.json` and fill in your database
   credentials.

3. Generate a crypto secret (used for JWT/session signing):

```console
npm run secret-gen
```

4. Import the base schema from `yukon.sql` into your database, then apply the additive
   migrations in `migrations/`:

```console
npm run migrate
```

5. Run the dev server (starts the Login and Blizzard worlds with hot reload):

```console
npm run dev
```

## World naming note

Club Penguin Live runs three worlds: Login, Blizzard, and a third world named **Iceberg** in
config and client-facing text, which runs as a container named `cpl-blizzard2` in the production
stack. This naming mismatch is intentional and preserved for historical reasons; it's not a bug.

## Contributing

Open an issue or pull request. There's no formal contribution process beyond that yet, if
something is unclear feel free to ask in an issue before sending a large PR.

## License

MIT, see [LICENSE](LICENSE). This repo carries the original license and copyright from
wizguin/yukon-server, on top of which Club Penguin Live's own systems are built.
