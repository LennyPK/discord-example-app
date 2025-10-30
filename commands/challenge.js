import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  MessageComponentTypes,
} from "discord-interactions"

export async function handleChallengeCommand(req, res) {
  const { id } = req.body

  // Interaction context
  const context = req.body.context
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? req.body.member.user.id : req.body.user.id
  // User's object choice
  const objectName = req.body.data.options[0].value

  // Create active game using message ID as the game ID
  activeGames[id] = {
    id: userId,
    objectName,
  }

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          // Fetches a random emoji to send from a helper function
          content: `Rock papers scissors challenge from <@${userId}>`,
        },
        {
          type: MessageComponentTypes.ACTION_ROW,
          components: [
            {
              type: MessageComponentTypes.BUTTON,
              // Append the game ID to use later on
              custom_id: `accept_button_${req.body.id}`,
              label: "Accept",
              style: ButtonStyleTypes.PRIMARY,
            },
          ],
        },
      ],
    },
  })
}
