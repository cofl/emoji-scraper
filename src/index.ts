import { Client, TextChannel, Message } from "discord.js";
import arg from "arg";
import { resolve } from "path";
import { readFileSync, existsSync, writeFileSync } from "fs";

const args = arg({
    "--login-token": String,
    "--guild-id": String,
    "--db-path": String,

    "-l": "--login-token",
    "-g": "--guild-id"
});
const dbPath = resolve(process.cwd(), args["--db-path"] || './emoji.json');
const db: Record<string, { emoji: Record<string, number>, lastMessage?: string, complete?: boolean, name?: string }> = existsSync(dbPath)
        ? JSON.parse(readFileSync(dbPath, { encoding: 'utf8' }))
        : {};
const emojiRegex = /<[^:]*:[^:]+:\d+>/g;
const emojiRegexGroups = /<[^:]*:([^:]+):(\d+)>/;
(async function test(token, guildId){
    if(!token)
        throw "Missing login token.";
    if(!guildId)
        throw "Missing guild ID.";
    const client = new Client();
    await client.login(token);
    await new Promise(resolve => setTimeout(resolve, 5000));
    const guild = client.guilds.resolve(guildId);
    if(!guild)
        throw "null guild";
    for(const channel of guild.channels.cache.filter(a => a.type === "text").filter(channel => {
            if(['416021132081364992', '700853136222584892', '456993120433733632', '362947188583563275'].includes(channel.id))
                return false;
            const perms = channel.permissionsFor(client.user!);
            if(!perms)
            {
                console.warn(`Could not read permissions for channel ${channel.name}`);
                return false;
            }
            return perms.has("READ_MESSAGE_HISTORY");
        }).values() as IterableIterator<TextChannel>)
    {
        const channelData = db[channel.id] ? db[channel.id] : (db[channel.id] = { emoji: {} });
        channelData.name = channel.name;
        if(channelData.complete)
        {
            console.log(`Skipping completed channel ${channel.name}`);
            continue;
        } else if(channelData.lastMessage)
        {
            console.log(`Resuming channel ${channel.name} before ${channelData.lastMessage}`);
        } else
        {
            console.log(`Entering new channel ${channel.name}`);
        }
        const emoji = channelData.emoji;
        const guildEmoji = guild.emojis.cache;
        do
        {
            const result = await channel.messages.fetch({ limit: 100, before: channelData.lastMessage });
            const messages: IterableIterator<Message> = result.values();
            for(const message of messages)
            {
                channelData.lastMessage = message.id;
                for(const match of message.content.match(emojiRegex) || [])
                {
                    const emojiID = match.match(emojiRegexGroups)![2];
                    const emojiObj = guildEmoji.get(emojiID);
                    if(emojiObj)
                        emoji[emojiObj.name] = (emoji[emojiObj.name] || 0) + 1;
                }
                for(const reaction of message.reactions.cache.values())
                {
                    const emojiID = reaction.emoji.id;
                    if(emojiID !== null)
                    {
                        const emojiObj = guildEmoji.get(emojiID);
                        if(emojiObj)
                            emoji[emojiObj.name] = (emoji[emojiObj.name] || 0) + (reaction.count || 1);
                    }
                }
            }
            if(result.size < 100)
            {
                console.log(`Final batch encountered ${result.size} items`);
                break;
            }
            console.log(`#${channel.name} :: before: ${channelData.lastMessage}`);
        } while(true);
        channelData.complete = true;
        // write out after each channel :aquachibi:
        writeFileSync(dbPath, JSON.stringify(db));
    }
    writeFileSync(dbPath, JSON.stringify(db));
    client.destroy();
})(args["--login-token"], args["--guild-id"]);
