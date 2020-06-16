import { Client, TextChannel, Message, GuildChannel, GuildEmoji, ReactionManager, GuildEmojiManager } from "discord.js";
import arg from "arg";
import { resolve } from "path";
import { readFileSync, existsSync, writeFileSync } from "fs";

const limit = 100;
const emojiRegex = /<[^:]*:[^:]+:\d+>/g.compile();
const emojiRegexGroups = /<[^:]*:([^:]+):(\d+)>/.compile();
const blacklistedChannels = [
    '416021132081364992',
    '700853136222584892',
    '456993120433733632',
    '362947188583563275'
];

function isChannelAccessible(client: Client): (channel: GuildChannel) => boolean
{
    return (channel: GuildChannel) => {
        if(blacklistedChannels.includes(channel.id))
            return false;
        const perms = channel.permissionsFor(client.user!);
        if(!perms)
        {
            console.warn(`Could not read permissions for channel ${channel.name}`);
            return false;
        }
        return perms.has("READ_MESSAGE_HISTORY");
    };
}
function raise(message: string): never { throw message; }
function *messageEmoji(guildEmoji: GuildEmojiManager, { content, reactions }: Message): Generator<[string, number], void, unknown>
{
    for(const match of content.match(emojiRegex) || [])
    {
        const emojiID = match.match(emojiRegexGroups)![2];
        const emojiObj = guildEmoji.cache.get(emojiID);
        if(emojiObj)
            yield [emojiObj.name, 1];
    }
    for(const { count, emoji } of reactions.cache.values())
    {
        if(emoji.id !== null)
        {
            const emojiObj = guildEmoji.cache.get(emoji.id);
            if(emojiObj)
                yield [emojiObj.name, count || 1];
        }
    }
}

interface DatabaseType
{
    emoji: Record<string, number>;
    channels: Record<string, DatabaseRecordType>;
};
interface DatabaseRecordType
{
    id: string;
    name: string;
    emoji: Record<string, number>;
    oldestProcessedMessage?: string;
    newestProcessedMessage?: string;
};

const args = arg({
    "--login-token": String,
    "--guild-id": String,
    "--db-path": String,

    "-l": "--login-token",
    "-g": "--guild-id"
});

const dbPath = resolve(process.cwd(), args["--db-path"] || './emoji.json');
const loginToken = args['--login-token'] || raise(`Missing login token`);
const guildId = args['--guild-id'] || raise(`Missing guild ID`);

const db: DatabaseType = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath, { encoding: 'utf8' })) : { emoji: {}, channels: {} };
(async function test(){
    const client = new Client();
    await client.login(loginToken);
    await new Promise(resolve => setTimeout(resolve, 5000)); // wait for channel cache to populate

    const guild = client.guilds.resolve(guildId) || raise(`cannot find guild`);
    await guild.me!.setNickname('!cofl-scraper');
    await client.user!.setActivity('emoji scraper go brrrrr', { type: 'CUSTOM_STATUS' });
    const textChannels = guild.channels.cache.filter(a => a.type === `text`);
    for(const channel of textChannels.filter(isChannelAccessible(client)).values() as IterableIterator<TextChannel>)
    {
        console.log(`Processing channel #${channel.name}`);
        const channelData = db.channels[channel.id] ? db.channels[channel.id] : (db.channels[channel.id] = {
            id: channel.id,
            name: channel.name,
            emoji: {}
        });

        // count up old messages
        let first: string | undefined = undefined;
        for(let before = channelData.oldestProcessedMessage, last: string | undefined = undefined;;before = last)
        {
            console.log(`\t#${channel.name} :: before ${before || 'newest'}`);
            const result = await channel.messages.fetch({ limit, before })
            const messages: IterableIterator<Message> = result.values();
            for(const message of messages)
            {
                last = message.id;
                if(!first)
                    first = message.id;
                for(const [emojiName, count] of messageEmoji(guild.emojis, message))
                {
                    channelData.emoji[emojiName] = (channelData.emoji[emojiName] || 0) + count;
                    db.emoji[emojiName] = (db.emoji[emojiName] || 0) + count;
                }
            }
            if(!last)
                break; // no older messages were processed
            channelData.oldestProcessedMessage = last;
            if(result.size < limit)
            {
                console.log(`\t#${channel.name} :: completed.`);
                break; // older messages were process, but we're done with the last batch
            }
        }

        // count up new messages since last run
        if(channelData.newestProcessedMessage)
        {
            first = undefined;
            for(let before: string | undefined = undefined,
                    last: string | undefined = undefined;;before = last)
            {
                console.log(`\t#${channel.name} :: before ${before || 'newest'}`);
                const result = await channel.messages.fetch({ limit, before })
                const messages: IterableIterator<Message> = result.values();
                for(const message of messages)
                {
                    last = message.id;
                    if(last == channelData.newestProcessedMessage)
                        break;
                    if(!first)
                        first = message.id;
                    for(const [emojiName, count] of messageEmoji(guild.emojis, message))
                    {
                        channelData.emoji[emojiName] = (channelData.emoji[emojiName] || 0) + count;
                        db.emoji[emojiName] = (db.emoji[emojiName] || 0) + count;
                    }
                }
                if(!last || result.size < limit)
                    break; // we're done with the last batch
            }

            console.log(`\t#${channel.name} :: caught up.`);
        }
        if(first)
            channelData.newestProcessedMessage = first;
        console.log();
        // write out after each channel :aquachibi:
        writeFileSync(dbPath, JSON.stringify(db));
    }

    // and write out once at the end for good measure
    writeFileSync(dbPath, JSON.stringify(db));
    client.destroy();
})();
