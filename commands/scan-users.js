import { InteractionResponseType } from "discord-interactions"
import { saveMembers } from "../database.js"
import { DiscordRequest } from "../utils.js"

export async function handleScanUsersCommand(req, res) {
  const { guild_id, token } = req.body

  // Acknowledge the command and defer the response.
  // This is important for commands that may take longer than 3 seconds.
  res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  })

  try {
    // Fetch all members from the guild.
    // The API has a limit of 1000 members per request.
    // const endpoint = `guilds/${guild_id}/members?limit=1000`
    const endpoint = `guilds/${guild_id}/members?limit=1000`
    const membersRes = await DiscordRequest(endpoint, { method: "GET" })
    const members = await membersRes.json()

    // Extract user info and filter out bots
    const membersToSave = members.filter((member) => !member.user.bot)
    // members.map((member) => member.user).filter((user) => !user.bot)

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

  return
}
