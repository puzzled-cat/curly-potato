# discord_lists.py
# Lists & Reminders bot — compatible with discord.py versions where CommandTree.group() isn't available.
# Functions/behavior unchanged; we register the /list group via app_commands.Group + tree.add_command().

import os
from dotenv import load_dotenv
import discord
from discord.ext import commands
from discord import app_commands
import aiohttp

# -------- config & client --------
load_dotenv()

TOKEN = os.getenv("DISCORD_LIST_TOKEN")                                   # token for THIS lists bot
LISTS_CHANNEL_ID = int(os.getenv("DISCORD_LIST_CHANNEL_ID", "0"))   # optional guard
API_BASE = os.getenv("API_BASE", "http://localhost:5000")            # your Flask API

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree

# -------- tiny HTTP helper --------
async def api_json(method: str, path: str, payload: dict | None = None):
    url = f"{API_BASE}{path}"
    async with aiohttp.ClientSession() as sess:
        async with sess.request(method.upper(), url, json=payload) as r:
            if r.status >= 400:
                try:
                    msg = (await r.json()).get("error", await r.text())
                except Exception:
                    msg = await r.text()
                raise RuntimeError(f"{method} {path} -> {r.status}: {msg}")
            try:
                return await r.json()
            except Exception:
                return {}

def norm_list_name(name: str) -> str:
    return name.strip().lower().replace(" ", "-")

def in_lists_channel(inter: discord.Interaction) -> bool:
    # If LISTS_CHANNEL_ID is set, restrict commands to that channel; else allow anywhere.
    return (LISTS_CHANNEL_ID == 0) or (inter.channel_id == LISTS_CHANNEL_ID)

# -------- events --------
@bot.event
async def on_ready():
    try:
        await tree.sync()
        print("✅ Slash commands synced")
    except Exception as e:
        print(f"Slash sync failed: {e}")
    print(f"✅ Logged in as {bot.user} (Lists bot)")
    if LISTS_CHANNEL_ID:
        ch = bot.get_channel(LISTS_CHANNEL_ID)
        if ch:
            await ch.send("🗒️ Lists bot is online.")

# -------- /list command group (manual registration for compatibility) --------
list_group = app_commands.Group(
    name="list",
    description="Manage shopping and todo lists"
)
tree.add_command(list_group)

@list_group.command(name="create", description="Create a new list")
@app_commands.describe(name="List name")
async def list_create(inter: discord.Interaction, name: str):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        await api_json("GET", f"/api/lists/{name_n}")  # ensure exists
        await inter.response.send_message(f"✅ List **{name_n}** is ready.", ephemeral=True)
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

@list_group.command(name="delete", description="Delete a list (clears all items)")
@app_commands.describe(name="List name")
async def list_delete(inter: discord.Interaction, name: str):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        data = await api_json("GET", f"/api/lists/{name_n}")
        for it in data.get("items", []):
            await api_json("DELETE", f"/api/lists/{name_n}/items/{it['id']}")
        await inter.response.send_message(f"🗑️ Cleared **{name_n}**.", ephemeral=False)
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

@list_group.command(name="add", description="Add an item to a list")
@app_commands.describe(name="List name", text="Item text")
async def list_add(inter: discord.Interaction, name: str, text: str):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        await api_json("POST", f"/api/lists/{name_n}/items", {"text": text})
        await inter.response.send_message(f"➕ Added to **{name_n}**: {text}", ephemeral=False)
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

@list_group.command(name="items", description="Show items in a list")
@app_commands.describe(name="List name")
async def list_items(inter: discord.Interaction, name: str):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        data = await api_json("GET", f"/api/lists/{name_n}")
        items = data.get("items", [])
        if not items:
            await inter.response.send_message(f"**{name_n}** is empty.", ephemeral=False)
            return
        lines = []
        for it in items:
            ck = "✅" if it.get("done") else "⬜"
            lines.append(f"{ck} `{it['id']}` — {it['text']}")
        desc = "\n".join(lines)
        embed = discord.Embed(
            title=f"{data.get('title', name_n)}",
            description=desc,
            color=0x2a6af3
        )
        await inter.response.send_message(embed=embed, ephemeral=False)
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

@list_group.command(name="done", description="Mark an item done/undone")
@app_commands.describe(name="List name", item_id="Item ID (e.g. it_1695999999999)", done="True to mark done")
async def list_done(inter: discord.Interaction, name: str, item_id: str, done: bool = True):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        await api_json("PATCH", f"/api/lists/{name_n}/items/{item_id}", {"done": done})
        await inter.response.send_message(
            f"{'✔️' if done else '↩️'} Updated `{item_id}` in **{name_n}**",
            ephemeral=False
        )
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

@list_group.command(name="remove_item", description="Delete an item from a list")
@app_commands.describe(name="List name", item_id="Item ID (e.g. it_1695999999999)")
async def list_remove_item(inter: discord.Interaction, name: str, item_id: str):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        await api_json("DELETE", f"/api/lists/{name_n}/items/{item_id}")
        await inter.response.send_message(f"🗑️ Deleted `{item_id}` from **{name_n}**", ephemeral=False)
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

# (Optional) clear all completed in a list
@list_group.command(name="clear_done", description="Remove all completed items from a list")
@app_commands.describe(name="List name")
async def list_clear_done(inter: discord.Interaction, name: str):
    if not in_lists_channel(inter):
        await inter.response.send_message(
            f"❌ Please use this command in <#{LISTS_CHANNEL_ID}>", ephemeral=True
        ); return
    name_n = norm_list_name(name)
    try:
        await api_json("POST", f"/api/lists/{name_n}/clear_done")
        await inter.response.send_message(f"🧹 Cleared completed in **{name_n}**", ephemeral=False)
    except Exception as e:
        await inter.response.send_message(f"❌ {e}", ephemeral=True)

# -------- run --------
if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Missing DISCORD_TOKEN for lists bot.")
    bot.run(TOKEN)
