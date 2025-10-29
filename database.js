import { prisma } from "./prisma-client.js"

export async function saveMembers(members) {
  for (const member of members) {
    const { user, nick } = member

    // Defensive check
    if (!user) continue

    console.log("Found:", member)

    await prisma.user.upsert({
      where: { discordId: user.id },
      update: {
        username: user.username,
        guildName: nick || user.username,
        globalName: user.global_name || user.username,
      },
      create: {
        discordId: user.id,
        username: user.username,
        guildName: nick || user.username,
        globalName: user.global_name || user.username,
      },
    })
  }

  return members.length
}

export async function findUserByMentionOrName(discordId, name) {
  console.log("Searching for user with Discord ID:", discordId, "or name:", name)

  if (discordId) {
    return prisma.user.findUnique({ where: { discordId: discordId } })
  }

  // Otherwise, search by username, global name, or guild name
  return prisma.user.findFirst({
    where: {
      OR: [{ globalName: name }, { username: name }, { guildName: name }],
    },
  })
}
