"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const arg_1 = __importDefault(require("arg"));
const args = arg_1.default({
    "--login-token": String,
    "--guild-id": String,
    "-l": "--login-token",
    "-g": "--guild-id"
});
(async function test(token, guildId) {
    if (!token)
        throw "Missing login token.";
    if (!guildId)
        throw "Missing guild ID.";
    const client = new discord_js_1.Client();
    await client.login(token);
    await new Promise(resolve => setTimeout(resolve, 5000));
    const emojiRegex = /<[^:]*:[^:]+:\d+>/g;
    const emojiRegexGroups = /<[^:]*:([^:]+):(\d+)>/;
    const guild = client.guilds.resolve(guildId);
    if (!guild)
        throw "null guild";
    const emoji = {};
    for (const channel of guild.channels.cache.filter(a => a.type === "text").values()) {
        console.log(`channel: ${channel.name}`);
        let before = undefined;
        do {
            const result = await channel.messages.fetch({ limit: 100, before });
            const messages = result.values();
            for (const message of messages) {
                before = message.id;
                for (const match of message.content.match(emojiRegex) || []) {
                    const emojiID = match.match(emojiRegexGroups)[2];
                    emoji[emojiID] = (emoji[emojiID] || 0) + 1;
                }
                for (const reaction of message.reactions.cache.values()) {
                    const emojiID = reaction.emoji.id;
                    if (emojiID !== null) {
                        emoji[emojiID] = (emoji[emojiID] || 0) + (reaction.count || 1);
                    }
                }
            }
            if (result.size < 100) {
                console.log(`Final batch encountered ${result.size} items`);
                break;
            }
            console.log(`before: ${before}`);
        } while (true);
    }
    const guildEmoji = guild.emojis.cache;
    console.log(Object.entries(emoji)
        .filter(([id,]) => guildEmoji.get(id))
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => [guildEmoji.get(id).name, count]));
    client.destroy();
})(args["--login-token"], args["--guild-id"]);
