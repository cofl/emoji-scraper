"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const arg_1 = __importDefault(require("arg"));
const path_1 = require("path");
const fs_1 = require("fs");
const limit = 100;
const emojiRegex = /<[^:]*:[^:]+:\d+>/g.compile();
const emojiRegexGroups = /<[^:]*:([^:]+):(\d+)>/.compile();
const blacklistedChannels = [
    '416021132081364992',
    '700853136222584892',
    '456993120433733632',
    '362947188583563275'
];
function isChannelAccessible(client) {
    return (channel) => {
        if (blacklistedChannels.includes(channel.id))
            return false;
        const perms = channel.permissionsFor(client.user);
        if (!perms) {
            console.warn(`Could not read permissions for channel ${channel.name}`);
            return false;
        }
        return perms.has("READ_MESSAGE_HISTORY");
    };
}
function raise(message) { throw message; }
function* messageEmoji(guildEmoji, { content, reactions }) {
    for (const match of content.match(emojiRegex) || []) {
        const emojiID = match.match(emojiRegexGroups)[2];
        const emojiObj = guildEmoji.cache.get(emojiID);
        if (emojiObj)
            yield [emojiObj.name, 1];
    }
    for (const { count, emoji } of reactions.cache.values()) {
        if (emoji.id !== null) {
            const emojiObj = guildEmoji.cache.get(emoji.id);
            if (emojiObj)
                yield [emojiObj.name, count || 1];
        }
    }
}
;
;
const args = arg_1.default({
    "--login-token": String,
    "--guild-id": String,
    "--db-path": String,
    "-l": "--login-token",
    "-g": "--guild-id"
});
const dbPath = path_1.resolve(process.cwd(), args["--db-path"] || './emoji.json');
const loginToken = args['--login-token'] || raise(`Missing login token`);
const guildId = args['--guild-id'] || raise(`Missing guild ID`);
const db = fs_1.existsSync(dbPath) ? JSON.parse(fs_1.readFileSync(dbPath, { encoding: 'utf8' })) : { emoji: {}, channels: {} };
(async function test() {
    const client = new discord_js_1.Client();
    await client.login(loginToken);
    await new Promise(resolve => setTimeout(resolve, 5000)); // wait for channel cache to populate
    const guild = client.guilds.resolve(guildId) || raise(`cannot find guild`);
    await guild.me.setNickname('!cofl-scraper');
    await client.user.setActivity('emoji scraper go brrrrr', { type: 'CUSTOM_STATUS' });
    const textChannels = guild.channels.cache.filter(a => a.type === `text`);
    for (const channel of textChannels.filter(isChannelAccessible(client)).values()) {
        console.log(`Processing channel #${channel.name}`);
        const channelData = db.channels[channel.id] ? db.channels[channel.id] : (db.channels[channel.id] = {
            id: channel.id,
            name: channel.name,
            emoji: {}
        });
        // count up old messages
        let first = undefined;
        for (let before = channelData.oldestProcessedMessage, last = undefined;; before = last) {
            console.log(`\t#${channel.name} :: before ${before || 'newest'}`);
            const result = await channel.messages.fetch({ limit, before });
            const messages = result.values();
            for (const message of messages) {
                last = message.id;
                if (!first)
                    first = message.id;
                for (const [emojiName, count] of messageEmoji(guild.emojis, message)) {
                    channelData.emoji[emojiName] = (channelData.emoji[emojiName] || 0) + count;
                    db.emoji[emojiName] = (db.emoji[emojiName] || 0) + count;
                }
            }
            if (!last)
                break; // no older messages were processed
            channelData.oldestProcessedMessage = last;
            if (result.size < limit) {
                console.log(`\t#${channel.name} :: completed.`);
                break; // older messages were process, but we're done with the last batch
            }
        }
        // count up new messages since last run
        if (channelData.newestProcessedMessage) {
            first = undefined;
            for (let before = undefined, last = undefined;; before = last) {
                console.log(`\t#${channel.name} :: before ${before || 'newest'}`);
                const result = await channel.messages.fetch({ limit, before });
                const messages = result.values();
                for (const message of messages) {
                    last = message.id;
                    if (last == channelData.newestProcessedMessage)
                        break;
                    if (!first)
                        first = message.id;
                    for (const [emojiName, count] of messageEmoji(guild.emojis, message)) {
                        channelData.emoji[emojiName] = (channelData.emoji[emojiName] || 0) + count;
                        db.emoji[emojiName] = (db.emoji[emojiName] || 0) + count;
                    }
                }
                if (!last || result.size < limit)
                    break; // we're done with the last batch
            }
            console.log(`\t#${channel.name} :: caught up.`);
        }
        if (first)
            channelData.newestProcessedMessage = first;
        console.log();
        // write out after each channel :aquachibi:
        fs_1.writeFileSync(dbPath, JSON.stringify(db));
    }
    // and write out once at the end for good measure
    fs_1.writeFileSync(dbPath, JSON.stringify(db));
    client.destroy();
})();
