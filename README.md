# Simple Slackyyy Botty 🤖

A simple, multi-feature Slack bot built with [Slack Bolt](https://slack.dev/bolt-js/) (Node.js), running in Socket Mode. It handles slash commands for fun utilities, weather lookups, birthday tracking, and trivia quizzes.

## Features

| Command | Description |
|---|---|
| `/simple-slackyyy-botty-ping` | Checks bot latency — responds with "Pong!" and response time in ms |
| `/simple-slackyyy-botty-help` | Lists all available commands |
| `/simple-slackyyy-botty-catfact` | Fetches a random cat fact from [catfact.ninja](https://catfact.ninja) |
| `/simple-slackyyy-botty-joke` | Gets a random joke from the internet |
| `/simple-slackyyy-botty-weather [city name]` | Gets current weather, high/low temps, air quality, and UV index for a city |
| `/simple-slackyyy-botty-birthday [MM-DD]` | Saves your birthday so the bot can wish you on the day |
| `/simple-slackyyy-botty-quiz` | Starts a trivia quiz — choose a subject, difficulty, and number of questions |

## Tech Stack

- **Node.js**
- **Slack Bolt SDK** (`@slack/bolt`)
- **Socket Mode** (no public URL/webhook needed)
- Simple file-based storage (`birthdays.db`) for birthday data

## Prerequisites

- Node.js installed (v16 or later recommended)
- A Slack workspace where you can install apps
- A Slack App created at [api.slack.com/apps](https://api.slack.com/apps) with:
  - Socket Mode enabled
  - A Bot Token (`xoxb-...`)
  - An App-Level Token (`xapp-...`) with `connections:write` scope
  - Slash commands registered matching the ones listed above

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-username/your-repo-name.git
   cd your-repo-name
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the project root with:
   ```env
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   ```

4. **Run the bot**
   ```bash
   node index.js
   ```

   You should see a confirmation that the bot has started and connected via Socket Mode.

## Project Structure

```
simple-slackyyy-botty/
├── index.js          # Main bot file — registers all slash commands
├── trivia-quiz.js     # Trivia quiz logic
├── birthdays.db        # Stored birthday data
├── package.json
├── .env               # Environment variables (not committed)
└── .gitignore
```

## Notes

- Make sure `.env` and `node_modules` are listed in `.gitignore` so secrets and dependencies aren't pushed to GitHub.
- Weather data requires a valid weather API key — add it to your `.env` if the bot uses one internally (e.g. `WEATHER_API_KEY=...`).

## License

MIT
