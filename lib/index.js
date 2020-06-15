"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const arg_1 = __importDefault(require("arg"));
const path_1 = require("path");
const fs_1 = require("fs");
const args = arg_1.default({
    "--login-token": String,
    "--guild-id": String,
    "--db-path": String,
    "-l": "--login-token",
    "-g": "--guild-id"
});
const dbPath = path_1.resolve(process.cwd(), args["--db-path"] || './emoji.json');
const db = fs_1.existsSync(dbPath)
    ? JSON.parse(fs_1.readFileSync(dbPath, { encoding: 'utf8' }))
    : {};
const emojiRegex = /<[^:]*:[^:]+:\d+>/g;
const emojiRegexGroups = /<[^:]*:([^:]+):(\d+)>/;
(async function test(token, guildId) {
    if (!token)
        throw "Missing login token.";
    if (!guildId)
        throw "Missing guild ID.";
    const client = new discord_js_1.Client();
    await client.login(token);
    await new Promise(resolve => setTimeout(resolve, 5000));
    const guild = client.guilds.resolve(guildId);
    if (!guild)
        throw "null guild";
    for (const channel of guild.channels.cache.filter(a => a.type === "text").filter(channel => {
        if (['416021132081364992', '700853136222584892', '456993120433733632', '362947188583563275'].includes(channel.id))
            return false;
        const perms = channel.permissionsFor(client.user);
        if (!perms) {
            console.warn(`Could not read permissions for channel ${channel.name}`);
            return false;
        }
        return perms.has("READ_MESSAGE_HISTORY");
    }).values()) {
        const channelData = db[channel.id] ? db[channel.id] : (db[channel.id] = { emoji: {} });
        channelData.name = channel.name;
        if (channelData.complete) {
            console.log(`Skipping completed channel ${channel.name}`);
            continue;
        }
        else if (channelData.lastMessage) {
            console.log(`Resuming channel ${channel.name} before ${channelData.lastMessage}`);
        }
        else {
            console.log(`Entering new channel ${channel.name}`);
        }
        const emoji = channelData.emoji;
        const guildEmoji = guild.emojis.cache;
        do {
            const result = await channel.messages.fetch({ limit: 100, before: channelData.lastMessage });
            const messages = result.values();
            for (const message of messages) {
                channelData.lastMessage = message.id;
                for (const match of message.content.match(emojiRegex) || []) {
                    const emojiID = match.match(emojiRegexGroups)[2];
                    const emojiObj = guildEmoji.get(emojiID);
                    if (emojiObj)
                        emoji[emojiObj.name] = (emoji[emojiObj.name] || 0) + 1;
                }
                for (const reaction of message.reactions.cache.values()) {
                    const emojiID = reaction.emoji.id;
                    if (emojiID !== null) {
                        const emojiObj = guildEmoji.get(emojiID);
                        if (emojiObj)
                            emoji[emojiObj.name] = (emoji[emojiObj.name] || 0) + (reaction.count || 1);
                    }
                }
            }
            if (result.size < 100) {
                console.log(`Final batch encountered ${result.size} items`);
                break;
            }
            console.log(`#${channel.name} :: before: ${channelData.lastMessage}`);
        } while (true);
        channelData.complete = true;
        // write out after each channel :aquachibi:
        fs_1.writeFileSync(dbPath, JSON.stringify(db));
    }
    fs_1.writeFileSync(dbPath, JSON.stringify(db));
    client.destroy();
})(args["--login-token"], args["--guild-id"]);
