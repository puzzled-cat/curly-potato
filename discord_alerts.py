import os
from dotenv import load_dotenv
import discord
from discord.ext import tasks

load_dotenv()  # loads .env if present

TOKEN = os.getenv("DISCORD_ALERTS_TOKEN")
CHANNEL_ID = int(os.getenv("DISCORD_ALERTS_CHANNEL_ID", "0"))

intents = discord.Intents.default()
client = discord.Client(intents=intents)

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
            if line.startswith("FED"):
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
