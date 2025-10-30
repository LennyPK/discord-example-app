import { InteractionResponseType } from "discord-interactions"
import { saveMembers } from "../database.js"
import { DiscordRequest } from "../utils.js"

export async function handleWordleInitCommand(req, res) {
  const { guild_id, token } = req.body

  // Acknowledge the command and defer the response.
  res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  })

  try {
    // 1. Fetch all members from the guild.
    const endpoint = `guilds/${guild_id}/members?limit=1000`
    const membersRes = await DiscordRequest(endpoint, { method: "GET" })
    const members = await membersRes.json()

    // Extract user info and filter out bots
    const membersToSave = members.filter((member) => !member.user.bot)

    // Save users to the database
    const count = await saveMembers(membersToSave)

    // Edit the original deferred message with the result
    const followupEndpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`
    await DiscordRequest(followupEndpoint, {
      method: "PATCH",
      body: { content: `Successfully scanned and saved ${count} users.` },
    })
  } catch (err) {
    console.error("Error scanning users:", err)
  }

  try {
    // 2. Scrape channel messages for scores
  } catch (err) {
    console.error("Error scraping scores:", err)
  }
}
