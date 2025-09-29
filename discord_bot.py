import os
from dotenv import load_dotenv
load_dotenv()  # loads .env if present
import discord
import asyncio
from discord.ext import tasks

TOKEN = os.getenv("DISCORD_TOKEN")
CHANNEL_ID = int(os.getenv("DISCORD_CHANNEL_ID", "0"))

intents = discord.Intents.default()
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f"Bot logged in as {client.user}")
    check_alerts.start()
@client.event
async def on_ready():
    print(f"✅ Logged in as {client.user}")
    channel = client.get_channel(CHANNEL_ID)
    await channel.send("🐾 CatPanel bot is online.")
    check_alerts.start()

@tasks.loop(seconds=30)
async def check_alerts():
    if CHANNEL_ID == 0:
        return
    try:
        with open("alerts.log", "r") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        if not lines:
            return

        channel = client.get_channel(CHANNEL_ID)
        for line in lines:
            # Examples of lines:
            # "Missed feeding for 09:00 at 2025-09-29 09:32:00"
            # "FED 12:00 at 2025-09-29 12:01:11 (via panel)"
            if line.startswith("FED"):
                # FED <time> at <timestamp> (...)
                parts = line.split()
                time_str = parts[1]
                ts = " ".join(parts[3:5]) if "at" in parts else ""
                msg = f"🐾 **Fed confirmed** — {time_str} ✅  ({ts})"
            elif line.startswith("UNSET"):
                parts = line.split()
                time_str = parts[1]
                ts = " ".join(parts[3:5]) if "at" in parts else ""
                msg = f"⚠️ Feed toggle **cleared** — {time_str}  ({ts})"
            elif line.startswith("Missed feeding for"):
                # old format
                msg = f"🚨 {line}"
            else:
                msg = line  # fallback

            await channel.send(msg)

        # clear file after sending
        open("alerts.log", "w").close()
    except FileNotFoundError:
        pass

client.run(TOKEN)
