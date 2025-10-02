# curly-potato
Basic Home Management UI - Tasks/Reminders/Alerts

### Environment & Data Files

Before running the application, make sure to create the required **configuration and data files**:

#### 1. `.env` file

Create a `.env` file in the project root to store your secrets and environment variables. For example:

```
DISCORD_ALERTS_TOKEN=your_discord_bot_token_here
DISCORD_ALERTS_CHANNEL_ID=your_discord_channel_id_here
DISCORD_LIST_TOKEN=your_discord_bot_token_here
DISCORD_LIST_CHANNEL_ID=your_discord_channel_id_here
```

> ⚠️ Never commit this file — it contains sensitive credentials.

#### 2. `/data` folder

Inside the `/data` directory, create the following files:

* `state.json`
* `food.json`
* `lists.json`
* `alerts.log`

These files are used to store application state, lists, and logs.
If they don’t exist, create empty files with those names before starting the server.

```bash
mkdir -p data
touch data/state.json data/food.json data/lists.json data/alerts.log
```

#### 3. Python Env Setup

```
source .venv/bin/activate

pip install -r requirements.txt

source .venv/bin/activate
python3 discord_bot.py
```